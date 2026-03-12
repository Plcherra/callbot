/**
 * PM2 ecosystem config for callbot.
 * Runs Next.js dashboard + Python voice backend (FastAPI/uvicorn).
 *
 * Usage: pm2 start ecosystem.config.cjs
 * Or: pm2 reload callbot --update-env (after initial start)
 *
 * Ensure npm run build runs before starting.
 * Env: .env and .env.local in project root. Both apps load them.
 */
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config({ path: path.join(__dirname, ".env.local") });

module.exports = {
  apps: [
    {
      name: "callbot",
      script: path.join(__dirname, "node_modules", "next", "dist", "bin", "next"),
      args: "start",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "callbot-voice",
      script: path.join(__dirname, "venv", "bin", "python"),  // Direct to venv python
      args: "-m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --workers 1 --log-level info",  // Adjust workers/log as needed
      cwd: __dirname,
      interpreter: null,  // No bash intermediary
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        PYTHONUNBUFFERED: "1",  // Real-time logs
      },
    },
  ],
};