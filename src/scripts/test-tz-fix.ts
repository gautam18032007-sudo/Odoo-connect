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

async function main() {
	const { sql } = await import("../lib/db");

	console.log("=== TIMEZONE EXPRESSION TEST IN POSTGRESQL ===");

	const testRes = await sql`
		SELECT 
			'2026-07-31 01:53:40+00'::timestamptz as orig_utc,
			('2026-07-31 01:53:40+00'::timestamptz AT TIME ZONE 'Asia/Kolkata')::text as ist_ts,
			('2026-07-31 01:53:40+00'::timestamptz AT TIME ZONE 'Asia/Kolkata')::date as correct_ist_date,
			('2026-07-31 01:53:40+00'::timestamptz AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date as double_tz_date
	`;

	console.table(testRes);
}

main().catch(console.error);
