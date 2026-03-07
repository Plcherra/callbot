import type WebSocket from "ws";

export function sendMedia(ws: WebSocket, buffer: Buffer): void {
  if (ws.readyState !== 1) return;
  const payload = buffer.toString("base64");
  ws.send(JSON.stringify({ event: "media", media: { payload } }));
}
