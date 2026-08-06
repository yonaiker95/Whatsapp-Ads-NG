require('dotenv').config();

const apiTarget = process.env.API_TARGET || `http://localhost:${process.env.API_PORT || process.env.PORT || '3000'}`;

module.exports = {
  '/api': {
    target: apiTarget,
    secure: false,
    changeOrigin: true,
    logLevel: process.env.PROXY_LOG || 'warn',
    ws: true,
  },
};
