/**
 * PM2 ecosystem config for callbot.
 * Python FastAPI backend only (voice + mobile API + Stripe + OAuth).
 * Landing page served as static files by nginx.
 *
 * Usage: pm2 start ecosystem.config.cjs
 * Or: pm2 reload callbot-voice --update-env
 *
 * Env: .env and .env.local in project root.
 */
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config({ path: path.join(__dirname, ".env.local") });

module.exports = {
  apps: [
    {
      name: "callbot-voice",
      script: path.join(__dirname, "venv", "bin", "python"),
      args: "-m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --workers 1 --log-level info",
      cwd: __dirname,
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
