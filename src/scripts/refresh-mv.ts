import * as path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
	const { sql } = await import("../lib/db");
	console.log("Refreshing materialized view mv_customer_identity...");
	await sql`REFRESH MATERIALIZED VIEW mv_customer_identity;`;
	console.log("✅ mv_customer_identity refreshed successfully!");
}

main().catch((err) => {
	console.error("❌ Failed to refresh MV:", err);
	process.exit(1);
});
