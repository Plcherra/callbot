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
      script: 'python3',
      args: '-m uvicorn main:app --host 0.0.0.0 --port 8000',
      cwd: path.join(__dirname, 'backend'),
    },
  ],
};
