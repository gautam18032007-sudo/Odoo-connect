import * as path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
	console.log("🔍 Checking sales_fact row distribution...");

	if (!process.env.DATABASE_URL) {
		console.error("❌ DATABASE_URL is not set.");
		process.exit(1);
	}

	const { sql } = await import("../../lib/db");

	try {
		const batches = await sql`
			SELECT id, filename, status, row_count, uploaded_at::text
			FROM upload_batches
			ORDER BY id ASC
		`;
		console.log("\n📋 Upload Batches:");
		console.table(batches);

		const counts = await sql`
			SELECT upload_id, COUNT(*)::int as row_count
			FROM sales_fact
			GROUP BY upload_id
			ORDER BY upload_id ASC
		`;
		console.log("\n📋 sales_fact counts by upload_id:");
		console.table(counts);
	} catch (err: any) {
		console.error("❌ Error querying database:", err.message || err);
		process.exit(1);
	}
}

main();
