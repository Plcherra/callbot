"""Content-addressed TTS audio cache (memory, filesystem, optional Redis+GCS)."""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import time
from collections import OrderedDict
from typing import Protocol

logger = logging.getLogger(__name__)


def build_cache_key(
    *,
    voice_name: str,
    language_code: str,
    normalized_text: str,
    speaking_rate: float,
    pitch: float,
    audio_encoding: str,
    sample_rate_hertz: int,
) -> str:
    """SHA256 hex digest for cache key."""
    payload = (
        f"{voice_name}|{language_code}|{normalized_text}|{speaking_rate}|"
        f"{pitch}|{audio_encoding}|{sample_rate_hertz}"
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class TtsCache(Protocol):
    async def get(self, key: str) -> bytes | None: ...
    async def put(self, key: str, data: bytes) -> None: ...


class NullTtsCache:
    async def get(self, key: str) -> bytes | None:
        return None

    async def put(self, key: str, data: bytes) -> None:
        return None


class MemoryLRUTtsCache:
    """In-process LRU with TTL."""

    def __init__(self, *, max_entries: int, ttl_seconds: int) -> None:
        self._max = max(1, max_entries)
        self._ttl = ttl_seconds
        self._lock = asyncio.Lock()
        self._data: OrderedDict[str, tuple[float, bytes]] = OrderedDict()

    async def get(self, key: str) -> bytes | None:
        async with self._lock:
            now = time.time()
            if key not in self._data:
                return None
            exp, blob = self._data[key]
            if exp < now:
                del self._data[key]
                return None
            self._data.move_to_end(key)
            return blob

    async def put(self, key: str, data: bytes) -> None:
        async with self._lock:
            now = time.time()
            exp = now + self._ttl if self._ttl > 0 else float("inf")
            self._data[key] = (exp, data)
            self._data.move_to_end(key)
            while len(self._data) > self._max:
                self._data.popitem(last=False)


class FilesystemTtsCache:
    """Store blobs under a directory; TTL via mtime + cleanup on read."""

    def __init__(self, *, directory: str, ttl_seconds: int) -> None:
        self._dir = directory.rstrip(os.sep)
        self._ttl = ttl_seconds
        self._lock = asyncio.Lock()
        os.makedirs(self._dir, exist_ok=True)

    def _path(self, key: str) -> str:
        # shard by first 2 hex chars to avoid huge directories
        safe = key[:2] if len(key) else "00"
        sub = os.path.join(self._dir, safe)
        os.makedirs(sub, exist_ok=True)
        return os.path.join(sub, key)

    async def get(self, key: str) -> bytes | None:
        return await asyncio.to_thread(self._get_sync, key)

    def _get_sync(self, key: str) -> bytes | None:
        p = self._path(key)
        if not os.path.isfile(p):
            return None
        if self._ttl > 0:
            age = time.time() - os.path.getmtime(p)
            if age > self._ttl:
                try:
                    os.unlink(p)
                except OSError:
                    pass
                return None
        with open(p, "rb") as f:
            return f.read()

    async def put(self, key: str, data: bytes) -> None:
        async with self._lock:
            await asyncio.to_thread(self._put_sync, key, data)

    def _put_sync(self, key: str, data: bytes) -> None:
        p = self._path(key)
        tmp = p + ".tmp"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, p)


class RedisGcsTtsCache:
    """Redis presence + TTL; audio bytes in GCS."""

    def __init__(
        self,
        *,
        redis_url: str,
        bucket_name: str,
        prefix: str,
        ttl_seconds: int,
    ) -> None:
        import redis.asyncio as redis  # type: ignore[import-untyped]

        self._redis = redis.from_url(redis_url, decode_responses=True)
        self._gcs_bucket_name = bucket_name
        self._prefix = prefix.rstrip("/") + "/"
        self._ttl = ttl_seconds
        self._gcs_client = None

    def _bucket(self):
        if self._gcs_client is None:
            from google.cloud import storage

            self._gcs_client = storage.Client()
        return self._gcs_client.bucket(self._gcs_bucket_name)

    def _object_name(self, key: str) -> str:
        return f"{self._prefix}{key[:2]}/{key}"

    async def get(self, key: str) -> bytes | None:
        rk = f"tts:{key}"
        exists = await self._redis.get(rk)
        if not exists:
            return None
        return await asyncio.to_thread(self._download_sync, key)

    def _download_sync(self, key: str) -> bytes | None:
        bucket = self._bucket()
        blob = bucket.blob(self._object_name(key))
        if not blob.exists():
            return None
        return blob.download_as_bytes()

    async def put(self, key: str, data: bytes) -> None:
        rk = f"tts:{key}"
        await asyncio.to_thread(self._upload_sync, key, data)
        ttl = self._ttl if self._ttl > 0 else None
        if ttl:
            await self._redis.setex(rk, ttl, "1")
        else:
            await self._redis.set(rk, "1")

    def _upload_sync(self, key: str, data: bytes) -> None:
        bucket = self._bucket()
        blob = bucket.blob(self._object_name(key))
        blob.upload_from_string(data, content_type="application/octet-stream")


def create_tts_cache(
    *,
    backend: str,
    ttl_seconds: int,
    memory_max_entries: int,
    filesystem_dir: str,
    redis_url: str,
    gcs_bucket: str,
    gcs_prefix: str,
) -> TtsCache:
    b = (backend or "none").strip().lower()
    if b == "none":
        return NullTtsCache()
    if b == "memory":
        return MemoryLRUTtsCache(max_entries=memory_max_entries, ttl_seconds=ttl_seconds)
    if b == "filesystem":
        if not filesystem_dir.strip():
            logger.warning("[TTS cache] TTS_CACHE_FILESYSTEM_DIR unset; using memory cache")
            return MemoryLRUTtsCache(max_entries=memory_max_entries, ttl_seconds=ttl_seconds)
        return FilesystemTtsCache(directory=filesystem_dir.strip(), ttl_seconds=ttl_seconds)
    if b == "redis_gcs":
        if not redis_url.strip() or not gcs_bucket.strip():
            logger.warning("[TTS cache] redis_gcs requires TTS_CACHE_REDIS_URL and TTS_CACHE_GCS_BUCKET; using memory")
            return MemoryLRUTtsCache(max_entries=memory_max_entries, ttl_seconds=ttl_seconds)
        return RedisGcsTtsCache(
            redis_url=redis_url.strip(),
            bucket_name=gcs_bucket.strip(),
            prefix=gcs_prefix or "tts-cache/",
            ttl_seconds=ttl_seconds,
        )
    logger.warning("[TTS cache] unknown backend %r; using none", b)
    return NullTtsCache()
