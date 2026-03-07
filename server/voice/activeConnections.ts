import type WebSocket from "ws";

export const activeByCallSid = new Map<string, WebSocket>();
