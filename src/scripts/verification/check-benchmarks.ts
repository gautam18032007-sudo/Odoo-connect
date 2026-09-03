import * as path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
	console.log("🔍 Checking benchmark tables in the database...");

	if (!process.env.DATABASE_URL) {
		console.error("❌ DATABASE_URL is not set.");
		process.exit(1);
	}

	const { sql } = await import("../../lib/db");

	try {
		const tableCheck = await sql`
			SELECT table_name 
			FROM information_schema.tables 
			WHERE table_schema = 'public' 
			  AND table_name IN ('sales_fact_benchmark', 'upload_batches_benchmark', 'sales_fact_v_benchmark')
		`;
		console.log("📋 Existing benchmark tables/views:", tableCheck);

		for (const t of tableCheck) {
			const name = t.table_name;
			if (name.endsWith("_v_benchmark")) continue; // view
			const countRes = await sql.query(
				`SELECT COUNT(*)::int AS count FROM public.${name}`,
			);
			console.log(`  Row count in ${name}:`, countRes[0].count);
		}
	} catch (err: any) {
		console.error("❌ Error checking benchmarks:", err.message || err);
		process.exit(1);
	}
}

main();
