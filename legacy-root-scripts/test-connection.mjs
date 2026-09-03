import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Security remediation: this file previously hardcoded a live-looking
// plaintext Neon connection string (including password). Removed —
// environment configuration only, fail closed if missing. This script is
// also fully redundant with check-db-data.mjs / test-neon.ts / test-db.ts
// (same connectivity-check purpose, no unique logic) — safe to delete
// entirely; not deleted here, flagged for an explicit decision instead.
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set. Refusing to run without it.');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

try {
  const result = await sql`SELECT current_database() AS db, current_user AS usr, version() AS ver`;
  const row = result[0];
  console.log('✅ Connected successfully!');
  console.log('📦 Database  :', row.db);
  console.log('👤 User      :', row.usr);
  console.log('🐘 PostgreSQL:', row.ver.split(' ').slice(0, 2).join(' '));

  // List tables
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;
  console.log('\n📋 Tables in database:');
  if (tables.length === 0) {
    console.log('   (no tables found)');
  } else {
    tables.forEach(t => console.log('   -', t.table_name));
  }
} catch (err) {
  console.error('❌ Connection failed:', err.message);
}
