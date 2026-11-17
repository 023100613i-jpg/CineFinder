const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

if (!process.env.DATABASE_URL) {
    console.error('❌ Falta la variable DATABASE_URL (conexión a PostgreSQL).');
    process.exit(1);
}

const url = process.env.DATABASE_URL;
const esLocal = /localhost|127\.0\.0\.1/.test(url);
// Render, Neon, Supabase, etc. exigen SSL. En local no.
const pool = new Pool({
    connectionString: url,
    ssl: esLocal ? false : { rejectUnauthorized: false },
    max: 10
});

pool.on('error', (err) => console.error('Error inesperado en el pool de PostgreSQL:', err.message));

async function iniciarBD() {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
}

module.exports = { pool, iniciarBD };
