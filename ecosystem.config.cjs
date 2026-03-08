/**
 * PM2 ecosystem config for callbot.
 * Runs Next.js dashboard only. Voice backend runs separately (FastAPI/uvicorn).
 * Use: pm2 start ecosystem.config.cjs
 * Or: pm2 reload callbot --update-env (after initial start)
 * Ensure npm run build runs before starting.
 */
module.exports = {
  apps: [
    {
      name: "callbot",
      script: "npm",
      args: "start",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
