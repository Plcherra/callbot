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
      script: path.join(__dirname, "backend", "start.sh"),
      interpreter: "bash",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
    },
  ],
};
