import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL");
		process.exit(1);
	}
	const sql = neon(process.env.DATABASE_URL);

	const range = await sql`
		SELECT MIN(sale_date)::text as min_date, MAX(sale_date)::text as max_date, COUNT(*)::int as total_rows
		FROM sales_fact
	`;
	console.log("Raw Sales range:", range[0]);

	const viewRange = await sql`
		SELECT MIN(sale_date)::text as min_date, MAX(sale_date)::text as max_date, COUNT(*)::int as total_rows
		FROM sales_fact_v
	`;
	console.log("View Sales range:", viewRange[0]);
}

main().catch(console.error);
