import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function migrate() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL in environment.");
		process.exit(1);
	}

	console.log("Connecting to database...");
	const sql = neon(process.env.DATABASE_URL);

	console.log("Creating store_calendar stub table...");
	await sql`
    CREATE TABLE IF NOT EXISTS store_calendar (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      billed_by TEXT NOT NULL,
      is_open BOOLEAN NOT NULL DEFAULT TRUE,
      holiday_name TEXT,
      UNIQUE (date, billed_by)
    );
  `;

	console.log("Creating optimized database indexes on sales_fact...");
	await sql`CREATE INDEX IF NOT EXISTS idx_sales_store_date ON sales_fact (billed_by, sale_date);`;
	await sql`CREATE INDEX IF NOT EXISTS idx_sales_category ON sales_fact (category);`;
	await sql`CREATE INDEX IF NOT EXISTS idx_sales_product ON sales_fact (product_key);`;

	console.log(
		"✅ Store Command Center database migrations successfully applied.",
	);
}

migrate().catch((err) => {
	console.error("❌ Migration failed:", err);
	process.exit(1);
});
