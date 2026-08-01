import * as path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

if (!process.env.DATABASE_URL) {
	throw new Error("DATABASE_URL is not set");
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
	console.log("Starting backfill for billed_by...");

	const kljResult = await sql`
    UPDATE sales_fact
    SET billed_by = 'KLJ'
    WHERE (billed_by IS NULL OR billed_by = '' OR billed_by NOT IN ('KLJ', 'Smart_Works_Noida'))
      AND (store ILIKE '%klj%' OR store = 'KLJ')
  `;
	console.log(`Updated KLJ rows: ${kljResult.length ?? 0}`);

	const smartResult = await sql`
    UPDATE sales_fact
    SET billed_by = 'Smart_Works_Noida'
    WHERE (billed_by IS NULL OR billed_by = '' OR billed_by NOT IN ('KLJ', 'Smart_Works_Noida'))
      AND (store ILIKE '%smart%' OR store ILIKE '%noida%')
  `;
	console.log(`Updated Smart_Works_Noida rows: ${smartResult.length ?? 0}`);

	const fallbackResult = await sql`
    UPDATE sales_fact
    SET billed_by = 'KLJ'
    WHERE billed_by IS NULL OR billed_by = ''
  `;
	console.log(`Updated fallback rows: ${fallbackResult.length ?? 0}`);

	const counts = await sql`
    SELECT billed_by, count(*)::int AS count
    FROM sales_fact
    GROUP BY billed_by
    ORDER BY billed_by
  `;
	console.log("Current billed_by distribution:", counts);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
