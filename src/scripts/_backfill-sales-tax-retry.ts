import path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * Resilient full resync of sales (orders + lines) to backfill tax_amount.
 * Retries the whole pass up to 3 times if it hits a transient connection
 * error (Neon's serverless HTTP driver can drop under sustained sequential
 * load from the per-line existence-check pattern in upsertSalesLines).
 */
async function main() {
	const { OdooClient } = await import("@/lib/odoo/client");
	const { syncSales } = await import("@/lib/odoo/sync/syncSales");

	const client = new OdooClient();
	console.log("Mock mode:", client.getMockModeStatus());
	await client.authenticate();

	const MAX_ATTEMPTS = 3;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		console.log(`--- Sales resync attempt ${attempt}/${MAX_ATTEMPTS} ---`);
		try {
			const count = await syncSales(client, null);
			console.log(`Attempt ${attempt} succeeded. Orders processed: ${count}`);
			if (count > 0) {
				return;
			}
			console.log(
				"Zero orders processed — treating as a failed attempt, retrying...",
			);
		} catch (err: any) {
			console.error(`Attempt ${attempt} failed:`, err.message);
		}
		if (attempt < MAX_ATTEMPTS) {
			await new Promise((resolve) => setTimeout(resolve, 5000));
		}
	}
	console.error("All attempts exhausted.");
	process.exit(1);
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error("Backfill failed:", err);
		process.exit(1);
	});
