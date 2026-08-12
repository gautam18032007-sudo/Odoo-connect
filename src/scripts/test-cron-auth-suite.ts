import * as fs from "node:fs";
import * as path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
	const envConfig = fs.readFileSync(envPath, "utf8");
	for (const line of envConfig.split("\n")) {
		const trimmed = line.trim();
		if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
			const [key, ...valueParts] = trimmed.split("=");
			const value = valueParts.join("=").replace(/^["']|["']$/g, "");
			if (key && !process.env[key.trim()]) {
				process.env[key.trim()] = value;
			}
		}
	}
}

async function runTests() {
	const { GET: adminSyncGET } = await import(
		"../app/api/admin/odoo-sync/route"
	);
	const { NextRequest } = await import("next/server");

	const secret = process.env.CRON_SECRET || "zenzebra_test_cron_secret_2026";
	process.env.CRON_SECRET = secret;

	console.log("\n========================================================");
	console.log("CRON ENDPOINT AUTHENTICATION TEST SUITE (/api/admin/odoo-sync)");
	console.log("========================================================\n");

	// Test 1: No Authorization header
	console.log("--- TEST 1: No Authorization header ---");
	const req1 = new NextRequest(
		"http://localhost:3000/api/admin/odoo-sync?mode=delta",
	);
	const res1 = await adminSyncGET(req1);
	const data1 = await res1.json();
	console.log("Status:", res1.status, "(Expected: 401)");
	console.log("Body:", JSON.stringify(data1));
	if (res1.status !== 401) throw new Error("Test 1 Failed");
	console.log("✅ TEST 1 PASSED: 401 Unauthorized\n");

	// Test 2: Wrong Authorization header
	console.log("--- TEST 2: Wrong Authorization header ---");
	const req2 = new NextRequest(
		"http://localhost:3000/api/admin/odoo-sync?mode=delta",
		{
			headers: { Authorization: "Bearer invalid_secret_123" },
		},
	);
	const res2 = await adminSyncGET(req2);
	const data2 = await res2.json();
	console.log("Status:", res2.status, "(Expected: 401)");
	console.log("Body:", JSON.stringify(data2));
	if (res2.status !== 401) throw new Error("Test 2 Failed");
	console.log("✅ TEST 2 PASSED: 401 Unauthorized\n");

	// Test 3: Correct CRON_SECRET header
	console.log("--- TEST 3: Correct CRON_SECRET header ---");
	const req3 = new NextRequest(
		"http://localhost:3000/api/admin/odoo-sync?mode=delta",
		{
			headers: { Authorization: `Bearer ${secret}` },
		},
	);
	const res3 = await adminSyncGET(req3);
	const data3 = await res3.json();
	console.log("Status:", res3.status, "(Expected: 200)");
	console.log("Body:", JSON.stringify(data3, null, 2));
	if (res3.status !== 200) throw new Error("Test 3 Failed");
	console.log("✅ TEST 3 PASSED: 200 OK (Sync executed or safely locked)\n");

	console.log("🎉 ALL CRON AUTHENTICATION TESTS PASSED PERFECTLY!\n");
}

runTests().catch((err) => {
	console.error("❌ Test suite error:", err);
	process.exit(1);
});
