/**
 * PM2 ecosystem config for callbot.
 * Uses tsx to run server.js (which requires TypeScript voiceStreamHandler).
 * Use: pm2 start ecosystem.config.cjs
 * Or: pm2 reload callbot --update-env (after initial start)
 */
module.exports = {
  apps: [
    {
      name: "callbot",
      script: "npm",
      args: "run start",
      cwd: __dirname,
      env_file: ".env",
      env: { NODE_ENV: "production" },
    },
  ],
};
