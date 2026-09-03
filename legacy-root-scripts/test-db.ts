import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { sql } from "../src/lib/db";

async function main() {
	try {
		const rawStores =
			await sql`SELECT DISTINCT billed_by, COUNT(*) FROM sales_fact GROUP BY billed_by ORDER BY billed_by`;
		console.log("Raw stores from sales_fact:", rawStores);

		const viewStores =
			await sql`SELECT DISTINCT billed_by, COUNT(*) FROM sales_fact_v GROUP BY billed_by ORDER BY billed_by`;
		console.log("View stores from sales_fact_v:", viewStores);
	} catch (err) {
		console.error("DB Error:", err);
	}
}

main();
