/**
 * PM2 — start from repo root: pm2 start deploy/ecosystem.config.cjs
 */
module.exports = {
    apps: [
        {
            name: 'hmherbs-api',
            cwd: __dirname + '/../backend',
            script: 'server.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '500M',
            env: {
                NODE_ENV: 'production'
            }
        }
    ]
};
