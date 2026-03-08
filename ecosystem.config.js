/**
 * PM2 config for Echodesk on VPS.
 * Loads .env and starts Next.js + Python voice backend.
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *
 * Env: .env in project root. Include NEXT_SERVER_ACTIONS_ENCRYPTION_KEY for Server Actions.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const env = process.env;

module.exports = {
  apps: [
    {
      name: 'callbot',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: __dirname,
      env,
    },
    {
      name: 'callbot-voice',
      script: 'python3',
      args: '-m uvicorn main:app --host 0.0.0.0 --port 8000',
      cwd: path.join(__dirname, 'backend'),
      env,
    },
  ],
};
