import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.log('DATABASE HOST: NONE');
  console.log('DATABASE NAME: NONE');
  console.log('DATABASE CONFIGURED: NO');
  console.log('\n❌ BLOCKER: DATABASE_URL is missing from .env.local');
  process.exit(1);
}

const parsed = new URL(dbUrl);
console.log(`DATABASE HOST: ${parsed.hostname}`);
console.log(`DATABASE NAME: ${parsed.pathname.replace(/^\//, '')}`);
console.log('DATABASE CONFIGURED: YES');
console.log('CREDENTIALS: [REDACTED]');

const sql = neon(dbUrl);

try {
  const res = await sql`SELECT 1 AS alive;`;
  console.log('\nSELECT 1 PROBE: SUCCESS');
  console.log('RESULT:', res);
} catch (err) {
  console.log('\nSELECT 1 PROBE: FAILED');
  console.log(`ERROR: ${err.message}`);
  if (err.message?.includes('compute time quota') || err.message?.includes('402')) {
    console.log('STATUS CODE: 402 (Compute Quota Exceeded on configured host)');
  }
}
