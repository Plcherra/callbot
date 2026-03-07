export type StreamParams = { receptionist_id?: string; call_sid?: string; caller_phone?: string; direction?: string };

export function getStreamParams(urlOrSearch: string): StreamParams {
  const search = urlOrSearch.startsWith("?") ? urlOrSearch : `?${urlOrSearch}`;
  const u = new URL(search, "http://localhost");
  const params: StreamParams = {};
  u.searchParams.forEach((v, k) => {
    if (k === "receptionist_id") params.receptionist_id = v;
    if (k === "call_sid") params.call_sid = v;
    if (k === "caller_phone") params.caller_phone = v;
    if (k === "direction") params.direction = v;
  });
  return params;
}

export function ts(): string { return new Date().toISOString(); }

export function parseMessageChunk(data: Buffer | string): Buffer | null {
  if (Buffer.isBuffer(data)) return data;
  if (typeof data !== "string") return null;
  try {
    const msg = JSON.parse(data) as { media?: { payload?: string }; payload?: string };
    const b64 = msg.media?.payload ?? msg.payload;
    return b64 ? Buffer.from(b64, "base64") : null;
  } catch { return null; }
}
