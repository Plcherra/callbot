/**
 * PM2 config for Echodesk on VPS.
 * Starts Next.js + Python voice backend.
 *
 * Usage: pm2 start ecosystem.config.js
 *
 * Env: .env in project root. Both apps load it automatically.
 */
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'callbot',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: __dirname,
    },
    {
      name: 'callbot-voice',
      script: path.join(__dirname, 'backend', 'start.sh'),
      interpreter: 'bash',
      cwd: __dirname,
    },
  ],
};
