// Run a single MySQL migration file using the server's DB credentials.
// Handles client-side DELIMITER directives (which the mysql2 driver does not).
// Usage:
//   node scripts/run-migration.js ../database/migrations/<file>.sql


const { loadBackendEnv, createPool, createConnection } = require('../utils/dbConfig');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function splitWithDelimiters(sql) {
    // Strip line comments (-- ... and # ...) and block comments
    const lines = sql.split(/\r?\n/);
    const cleaned = [];
    let inBlock = false;
    for (const line of lines) {
        let l = line;
        if (inBlock) {
            const end = l.indexOf('*/');
            if (end >= 0) { inBlock = false; l = l.slice(end + 2); } else { continue; }
        }
        // strip /* ... */ on same line
        l = l.replace(/\/\*[\s\S]*?\*\//g, '');
        if (l.includes('/*')) { inBlock = true; l = l.slice(0, l.indexOf('/*')); }
        // Strip -- and # comments (only when not inside a quoted string - simple heuristic)
        const m = l.match(/^(\s*)(--|#)/);
        if (m) continue;
        cleaned.push(l);
    }
    const text = cleaned.join('\n');

    // Walk through tokens, respecting DELIMITER directives
    const statements = [];
    let delimiter = ';';
    let buffer = '';
    const lines2 = text.split(/\r?\n/);
    for (const rawLine of lines2) {
        const line = rawLine;
        const trimmed = line.trim();
        const dm = /^DELIMITER\s+(\S+)/i.exec(trimmed);
        if (dm) {
            const flushed = buffer.trim();
            if (flushed) statements.push(flushed);
            buffer = '';
            delimiter = dm[1];
            continue;
        }
        buffer += line + '\n';
        // Try to split using current delimiter
        while (true) {
            const idx = buffer.indexOf(delimiter);
            if (idx < 0) break;
            const stmt = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + delimiter.length);
            if (stmt) statements.push(stmt);
        }
    }
    const tail = buffer.trim();
    if (tail) statements.push(tail);
    return statements;
}

async function main() {
    loadBackendEnv();
    const arg = process.argv[2];
    if (!arg) {
        console.error('Usage: node scripts/run-migration.js <path-to-sql-file>');
        process.exit(1);
    }
    const filePath = path.resolve(process.cwd(), arg);
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
    }
    const sql = fs.readFileSync(filePath, 'utf8');
    const statements = splitWithDelimiters(sql);

    const config = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'hmherbs',
        multipleStatements: false,
    };
    console.log(`Connecting to ${config.user}@${config.host}:${config.port}/${config.database}...`);
    const conn = await mysql.createConnection(config);

    console.log(`Running ${statements.length} statement(s) from ${path.basename(filePath)}...`);
    let executed = 0;
    let skipped = 0;
    for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        const preview = stmt.replace(/\s+/g, ' ').slice(0, 100);
        try {
            await conn.query(stmt);
            executed++;
            console.log(`  [${i + 1}/${statements.length}] OK: ${preview}${stmt.length > 100 ? '…' : ''}`);
        } catch (err) {
            // Tolerate "already exists" errors so the migration is idempotent
            const code = err.code || '';
            const benign = ['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_TABLE_EXISTS_ERROR', 'ER_DUP_ENTRY', 'ER_SP_ALREADY_EXISTS'];
            if (benign.includes(code)) {
                skipped++;
                console.log(`  [${i + 1}/${statements.length}] SKIP (${code}): ${preview}`);
            } else {
                console.error(`\nFAILED on statement ${i + 1}: ${preview}`);
                console.error(err);
                await conn.end();
                process.exit(1);
            }
        }
    }
    await conn.end();
    console.log(`\nDone. Executed: ${executed}, Skipped: ${skipped}, Total: ${statements.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
