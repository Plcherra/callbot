/**
 * PM2 ecosystem config for callbot.
 * Uses tsx to run server.js (which requires TypeScript voiceStreamHandler).
 * Use: pm2 start ecosystem.config.cjs
 * Or: pm2 reload callbot --update-env (after initial start)
 */
module.exports = {
  apps: [{
      name: "callbot",
      script: "./server.js",
      interpreter: 'tsx',
      exec_mode: "cluster",
      instances: 'max', 
      autorestart: true,
      watch: false,
      env: {
      NODE_ENV: "production"
    }
  }]
};
