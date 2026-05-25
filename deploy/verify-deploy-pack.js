#!/usr/bin/env node
/**
 * Verifies DigitalOcean deploy files exist. Run: npm run deploy:verify
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const required = [
    'DIGITALOCEAN_DEPLOY.md',
    'DIGITALOCEAN_CHECKLIST.md',
    'database/DEPLOY-DATABASE.md',
    'database/deploy-staging.sql',
    'database/build-deploy-bundle.js',
    'backend/.env.digitalocean.example',
    'backend/certs/.gitkeep',
    'deploy/README.md',
    'deploy/bootstrap-droplet.sh',
    'deploy/setup-nginx-ssl.sh',
    'deploy/import-database.sh',
    'deploy/import-database.ps1',
    'deploy/upload-to-droplet.ps1',
    'deploy/db-connection.env.example',
    'deploy/ecosystem.config.cjs',
    'deploy/nginx/hmherbs.conf.example',
    '.do/app.yaml'
];

let missing = 0;
for (const rel of required) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) {
        console.error('MISSING:', rel);
        missing++;
    }
}

if (missing) {
    console.error(`\n${missing} file(s) missing. Run npm run deploy:bundle`);
    process.exit(1);
}

const sqlStat = fs.statSync(path.join(root, 'database/deploy-staging.sql'));
console.log('Deploy pack OK');
console.log(`  deploy-staging.sql: ${(sqlStat.size / 1024).toFixed(0)} KB`);
console.log('  Next: DIGITALOCEAN_CHECKLIST.md');
