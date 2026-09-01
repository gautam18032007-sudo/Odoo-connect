import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const parsed = new URL(dbUrl);
console.log('Testing connection with:');
console.log('Host:', parsed.hostname);
console.log('Path:', parsed.pathname);

// Test 1: As configured in .env.local
console.log('\n--- Test 1: Configured URL ---');
try {
  const sql1 = neon(dbUrl);
  const start = Date.now();
  const res1 = await sql1`SELECT 1 AS alive, version(), current_database()`;
  console.log(`✅ Success in ${Date.now() - start}ms:`, res1[0]);
} catch (err) {
  console.error('❌ Test 1 Failed:', err.message);
  if (err.sourceError) {
    console.error('Source error:', err.sourceError);
  }
}

// Test 2: Without channel_binding
const urlWithoutChannelBinding = dbUrl.replace('&channel_binding=require', '').replace('channel_binding=require&', '').replace('?channel_binding=require', '');
console.log('\n--- Test 2: Without channel_binding ---');
try {
  const sql2 = neon(urlWithoutChannelBinding);
  const start = Date.now();
  const res2 = await sql2`SELECT 1 AS alive, version(), current_database()`;
  console.log(`✅ Success in ${Date.now() - start}ms:`, res2[0]);
} catch (err) {
  console.error('❌ Test 2 Failed:', err.message);
}

// Test 3: Direct endpoint (without -pooler)
const urlDirect = urlWithoutChannelBinding.replace('-pooler', '');
console.log('\n--- Test 3: Direct host (without -pooler) ---');
try {
  const sql3 = neon(urlDirect);
  const start = Date.now();
  const res3 = await sql3`SELECT 1 AS alive, version(), current_database()`;
  console.log(`✅ Success in ${Date.now() - start}ms:`, res3[0]);
} catch (err) {
  console.error('❌ Test 3 Failed:', err.message);
}
