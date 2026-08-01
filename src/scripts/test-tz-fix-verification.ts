import * as fs from "fs";
import * as path from "path";

// Load .env.local
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

function parseOdooDateToIso(dateStr: string | false | null): string {
	if (!dateStr) return new Date().toISOString();
	const formatted = dateStr.includes("Z") || dateStr.includes("+")
		? dateStr
		: `${dateStr.replace(" ", "T")}Z`;
	return new Date(formatted).toISOString();
}

async function main() {
	const { sql } = await import("../lib/db");
	const { OdooClient } = await import("../lib/odoo/client");

	console.log("=== TESTING PARSE_ODOO_DATE_TO_ISO & AT TIME ZONE 'Asia/Kolkata' ===");

	const client = new OdooClient();
	if (client.getMockModeStatus()) return;
	await client.authenticate();

	// 1. Fetch 31 Jul IST orders from Odoo
	const istStartUtc = "2026-07-30 18:30:00";
	const istEndUtc = "2026-07-31 18:29:59";

	const posOrdersOdoo = await client.callKw<any[]>("pos.order", "search_read", [], {
		domain: [
			["state", "in", ["paid", "done", "invoiced"]],
			["date_order", ">=", istStartUtc],
			["date_order", "<=", istEndUtc],
		],
		fields: ["id", "name", "date_order", "amount_total"],
	});

	console.log(`Odoo POS Orders for 31 Jul 2026 IST: Count = ${posOrdersOdoo.length}`);
	const sampleOdoo = posOrdersOdoo[0];
	console.log("Sample Odoo date_order:", sampleOdoo.date_order);
	console.log("Parsed ISO string with 'Z' suffix:", parseOdooDateToIso(sampleOdoo.date_order));

	// 2. Test SQL conversion with correct expression: (date_order AT TIME ZONE 'Asia/Kolkata')::date
	const testSql = await sql`
		SELECT 
			${parseOdooDateToIso(sampleOdoo.date_order)}::timestamptz as tz_val,
			(${parseOdooDateToIso(sampleOdoo.date_order)}::timestamptz AT TIME ZONE 'Asia/Kolkata')::text as ist_ts,
			(${parseOdooDateToIso(sampleOdoo.date_order)}::timestamptz AT TIME ZONE 'Asia/Kolkata')::date as ist_date
	`;
	console.table(testSql);
}

main().catch(console.error);
