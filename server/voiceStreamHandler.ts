/**
 * WebSocket handler for Telnyx bidirectional RTP streaming.
 * Receives RTP from Telnyx → Deepgram STT → Grok LLM → ElevenLabs TTS → sends media back.
 * Run via custom server (server.js).
 *
 * 1006 / silence killer fixes:
 * - Silence every 3s (Telnyx ~10s idle kill; community: 3s prevents 1006)
 * - WebSocket ping every 10s (keeps connection alive through NAT/proxies)
 * - Send silence packet IMMEDIATELY on connect, before async pipeline init
 */

export { handleVoiceStreamConnection } from "./voice/handler";
