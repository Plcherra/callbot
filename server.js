/**
 * Custom Next.js server with WebSocket support for /api/voice/stream.
 * Run: node server.js (instead of next start)
 */

const path = require("path");
const appRoot = path.resolve(__dirname);
require("dotenv").config({ path: path.join(appRoot, ".env") });
require("dotenv").config({ path: path.join(appRoot, ".env.local") });
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer } = require("ws");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    // Do not pass WebSocket upgrade requests to Next.js (causes bind error)
    if (req.headers.upgrade === "websocket") {
      res.socket?.once("close", () => {});
      return;
    }
    const parsedUrl = parse(req.url || "/", true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const { pathname, search } = parse(request.url || "");
    if (pathname === "/api/voice/stream") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request, search || "");
      });
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", (ws, request, search) => {
    const { handleVoiceStreamConnection } = require("./dist-server/server/voiceStreamHandler");
    handleVoiceStreamConnection(ws, { search: search || undefined });
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
    console.log(`> WebSocket: ws://localhost:${port}/api/voice/stream`);
  });
});
