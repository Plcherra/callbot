/**
 * PM2 ecosystem config for callbot (deploy copy).
 * Python FastAPI backend only (voice + mobile API + Stripe + OAuth).
 * Landing page served as static files by nginx.
 *
 * Usage (from project root):
 *   pm2 start deploy/pm2/ecosystem.config.cjs
 *   # or: pm2 start ecosystem.config.cjs (root copy)
 *
 * Env: .env and .env.local in project root.
 */
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

require("dotenv").config({ path: path.join(ROOT, ".env") });
require("dotenv").config({ path: path.join(ROOT, ".env.local") });

module.exports = {
  apps: [
    {
      name: "callbot-voice",
      script: path.join(ROOT, "venv", "bin", "python"),
      args: "-m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --workers 1 --log-level info",
      cwd: ROOT,
      interpreter: null,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        PYTHONUNBUFFERED: "1",
      },
    },
  ],
};
