import * as path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
	console.log(
		"🧹 Deleting extra upload batch 3 to restore frozen ground-truth state...",
	);

	if (!process.env.DATABASE_URL) {
		console.error("❌ DATABASE_URL is not set.");
		process.exit(1);
	}

	const { sql } = await import("../lib/db");

	try {
		// Cascades delete to sales_fact table automatically
		const _res = await sql`DELETE FROM upload_batches WHERE id = 3`;
		console.log(
			"✅ Batch 3 deleted successfully from upload_batches and sales_fact!",
		);
	} catch (err: any) {
		console.error("❌ Failed to delete batch 3:", err.message || err);
		process.exit(1);
	}
}

main();
