import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function runLoadTest() {
	console.log("==================================================");
	console.log("⚡ ZenZebra SRE Enterprise Load Simulation Suite");
	console.log("==================================================");

	if (!process.env.DATABASE_URL) {
		console.error("❌ FAIL: DATABASE_URL missing for load test.");
		process.exit(1);
	}

	const sql = neon(process.env.DATABASE_URL);
	const concurrentUsers = 100;

	console.log(
		`Simulating ${concurrentUsers} concurrent dashboard API read queries...`,
	);

	const startTime = Date.now();
	const queries = [];

	for (let i = 0; i < concurrentUsers; i++) {
		queries.push(
			sql`
				SELECT COALESCE(SUM(net_amount), 0) AS revenue, COUNT(DISTINCT bill_no) AS bills
				FROM sales_fact_v
				WHERE sale_date >= CURRENT_DATE - INTERVAL '30 days'
			`,
		);
	}

	try {
		const _results = await Promise.all(queries);
		const durationMs = Date.now() - startTime;
		const avgLatencyMs = Math.round(durationMs / concurrentUsers);

		console.log(`✅ LOAD TEST SUCCESSFUL`);
		console.log(`   Total Queries: ${concurrentUsers}`);
		console.log(`   Total Execution Duration: ${durationMs} ms`);
		console.log(`   Average Latency per Query: ${avgLatencyMs} ms`);
		console.log(
			`   Query Throughput: ${Math.round((concurrentUsers / durationMs) * 1000)} req/sec`,
		);
	} catch (err: any) {
		console.error("❌ LOAD TEST FAILED:", err.message);
		process.exit(1);
	}
}

runLoadTest().catch((err) => {
	console.error("❌ Load test exception:", err);
	process.exit(1);
});
