import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
	const sql = neon(process.env.DATABASE_URL!);
	await sql`UPDATE sales_fact SET billed_by = 'Klj store' WHERE billed_by IN ('KLJ', 'klj', 'Klj store')`;
	await sql`UPDATE sales_fact SET billed_by = 'SmartworksNoida Noida' WHERE billed_by IN ('Smart_Works_Noida', 'SmartworksNoida Noida') OR billed_by ILIKE '%smart%' OR billed_by ILIKE '%noida%'`;
	const counts =
		await sql`SELECT billed_by, count(*)::int FROM sales_fact GROUP BY billed_by ORDER BY billed_by`;
	console.log("Remapped billed_by:", counts);
	const viewCounts = await sql`SELECT count(*)::int FROM sales_fact_v`;
	console.log("sales_fact_v rows:", viewCounts[0]);
}

main().catch(console.error);
