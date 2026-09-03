import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function verify() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL in environment.");
		process.exit(1);
	}

	console.log("Connecting to database...");
	const sql = neon(process.env.DATABASE_URL);

	console.log("Checking store_alias_mapping...");
	const aliases = await sql`SELECT * FROM store_alias_mapping`;
	console.log("Alias mappings:", aliases);

	console.log("\nChecking store_dimension...");
	const dimensions = await sql`SELECT * FROM store_dimension`;
	console.log("Dimensions:", dimensions);

	console.log("\nChecking sales_fact store distribution...");
	const salesFactResult = await sql`
		SELECT COALESCE(billed_by, 'NULL') as billed_by, COUNT(*)::int as count 
		FROM sales_fact 
		GROUP BY 1 
		ORDER BY 2 DESC
	`;
	console.log("sales_fact distribution:", salesFactResult);

	console.log("\nChecking sales_fact_v view store distribution...");
	const viewResult = await sql`
		SELECT COALESCE(billed_by, 'NULL') as billed_by, store_display_name, COUNT(*)::int as count 
		FROM sales_fact_v 
		GROUP BY 1, 2 
		ORDER BY 3 DESC
	`;
	console.log("sales_fact_v distribution:", viewResult);
}

verify().catch((err) => {
	console.error("Verification failed:", err);
	process.exit(1);
});
