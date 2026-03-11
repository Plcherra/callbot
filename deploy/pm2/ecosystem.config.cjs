/**
 * PM2 ecosystem config for callbot.
 * Runs Next.js dashboard + Python voice backend (FastAPI/uvicorn).
 *
 * Usage (from project root):
 *   pm2 start deploy/pm2/ecosystem.config.cjs
 *   # or: pm2 start ecosystem.config.cjs (root copy)
 *
 * Ensure npm run build runs before starting.
 * Env: .env and .env.local in project root.
 */
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

require("dotenv").config({ path: path.join(ROOT, ".env") });
require("dotenv").config({ path: path.join(ROOT, ".env.local") });

module.exports = {
  apps: [
    {
      name: "callbot",
      script: path.join(ROOT, "node_modules", "next", "dist", "bin", "next"),
      args: "start",
      cwd: ROOT,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      env: { NODE_ENV: "production" },
    },
    {
      name: "callbot-voice",
      script: path.join(ROOT, "backend", "start.sh"),
      interpreter: "bash",
      cwd: ROOT,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
    },
  ],
};
