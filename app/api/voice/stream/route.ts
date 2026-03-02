/**
 * Voice stream WebSocket endpoint.
 * HTTP GET returns info; actual WebSocket is handled by custom server (server.js).
 * When using `next start`, this route is hit for HTTP; use `node server.js` for WebSocket support.
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest) {
  return NextResponse.json({
    message: "WebSocket required. Use wss:// endpoint. Run `node server.js` for WebSocket support.",
  });
}
