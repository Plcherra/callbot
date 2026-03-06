/**
 * PM2 ecosystem config for callbot.
 * Uses node (voiceStreamHandler compiled to dist-server during build).
 * Use: pm2 start ecosystem.config.cjs
 * Or: pm2 reload callbot --update-env (after initial start)
 * Ensure npm run build runs before starting (compiles server TS to dist-server).
 */
module.exports = {
  apps: [{
      name: "callbot",
      script: "./server.js",
      exec_mode: "cluster",
      instances: 'max', 
      autorestart: true,
      watch: false,
      env: {
      NODE_ENV: "production"
    }
  }]
};
