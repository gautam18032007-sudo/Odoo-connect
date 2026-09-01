import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('❌ Error: DATABASE_URL is not set in .env.local');
  process.exit(1);
}

try {
  const parsed = new URL(dbUrl);
  console.log('🔍 Environment Check:');
  console.log(`   Host    : ${parsed.hostname}`);
  console.log(`   Database: ${parsed.pathname.replace('/', '')}`);
  console.log('   Auth    : [REDACTED]');

  const sql = neon(dbUrl);
  console.log('\n📡 Running `SELECT 1` once...');
  const result = await sql`SELECT 1 AS ready`;
  console.log('✅ Query Result:', result);
  console.log('🎉 Neon database connection verified successfully!');
} catch (err) {
  console.error('❌ Failed to connect/execute query:', err.message);
  process.exit(1);
}
