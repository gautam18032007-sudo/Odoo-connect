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

async function main() {
	console.log("=== TESTING HEALTH CHECK & WEBHOOK ENDPOINTS ===");

	const { GET: healthGet } = await import("../../app/api/health/route");
	const { POST: webhookPost } = await import(
		"../../app/api/webhooks/odoo/route"
	);
	const { NextRequest } = await import("next/server");

	// 1. Test Health Check GET
	console.log("\n1. Testing GET /api/health ...");
	const healthReq = new NextRequest("http://localhost:3000/api/health");
	const healthRes = await healthGet(healthReq);
	const healthData = await healthRes.json();
	console.log("Health Status:", healthRes.status);
	console.log("Health Report:", JSON.stringify(healthData, null, 2));

	// 2. Test Webhook Secret Validation Failure (401)
	console.log(
		"\n2. Testing POST /api/webhooks/odoo without secret (401 expected) ...",
	);
	const unauthorizedReq = new NextRequest(
		"http://localhost:3000/api/webhooks/odoo",
		{
			method: "POST",
			headers: { "x-webhook-secret": "wrong-secret" },
			body: JSON.stringify({ id: 1618, model: "pos.order" }),
		},
	);
	const unauthRes = await webhookPost(unauthorizedReq);
	console.log("Unauthorized Status:", unauthRes.status);

	// 3. Test Valid Webhook Event POST
	console.log("\n3. Testing POST /api/webhooks/odoo with valid secret ...");
	const secret =
		process.env.ODOO_WEBHOOK_SECRET || "zenzebra_webhook_secret_2026";
	process.env.ODOO_WEBHOOK_SECRET = secret;

	const validReq = new NextRequest(
		`http://localhost:3000/api/webhooks/odoo?secret=${secret}`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				id: 1618,
				model: "pos.order",
				event_id: `evt_pos_1618_test_${Date.now()}`,
				write_date: "2026-08-01 13:30:41",
			}),
		},
	);

	const validRes = await webhookPost(validReq);
	const validData = await validRes.json();
	console.log("Valid Webhook Status:", validRes.status);
	console.log("Webhook Response:", JSON.stringify(validData, null, 2));

	// 4. Test Deduplication POST (same event_id)
	console.log("\n4. Testing POST /api/webhooks/odoo duplicate event ...");
	const dupReq = new NextRequest(
		`http://localhost:3000/api/webhooks/odoo?secret=${secret}`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				id: 1618,
				model: "pos.order",
				event_id: validData.eventId,
				write_date: "2026-08-01 13:30:41",
			}),
		},
	);
	const dupRes = await webhookPost(dupReq);
	const dupData = await dupRes.json();
	console.log("Duplicate Webhook Status:", dupRes.status);
	console.log("Duplicate Webhook Response:", JSON.stringify(dupData, null, 2));
}

main().catch(console.error);
