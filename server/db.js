// db.js — Neon.tech PostgreSQL connection
// ============================================================
// REPLACE the connection string below with your Neon.tech URL.
// You can also set DATABASE_URL as an environment variable and
// it will automatically be used instead of the hard-coded value.
// ============================================================

const { Pool } = require('pg');

// ⚠️  REPLACE THIS with your actual Neon.tech connection string
//     Format: postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
const NEON_CONNECTION_STRING =
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_0nRklDYxLV5g@ep-red-mouse-apjpgh5i-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({
  connectionString: NEON_CONNECTION_STRING,
  ssl: { rejectUnauthorized: false }, // required for Neon.tech
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

/**
 * Run a parameterised query against Neon.
 * @param {string} text   SQL statement
 * @param {any[]}  params Positional parameters ($1, $2, …)
 */
async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

module.exports = { query, pool };
