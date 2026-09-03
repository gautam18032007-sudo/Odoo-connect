import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import { commitPurchaseUploadFile } from "../../lib/founder/purchase-import-service";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Seed purchase_fact from a vendor-purchase workbook.
 *
 * Usage:
 *   npx ts-node -P tsconfig.scripts.json src/scripts/seed-purchase-from-excel.ts "/path/to/net purchase.xlsx"
 */
async function main() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL in environment.");
		process.exit(1);
	}

	const filePath =
		process.argv[2] || "/Users/diwakarkumarbhagat/Downloads/net purchase.xlsx";

	if (!fs.existsSync(filePath)) {
		console.error(`Purchase Excel file not found at: ${filePath}`);
		console.error(
			'Pass the path as an argument: ... seed-purchase-from-excel.ts "/path/to/net purchase.xlsx"',
		);
		process.exit(1);
	}

	console.log(`Loading purchase file from: ${filePath}...`);
	const buffer = fs.readFileSync(filePath);
	const file = new File([buffer], path.basename(filePath), {
		type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	});

	const sql = neon(process.env.DATABASE_URL);
	console.log("Starting transactional purchase import (full_replace)...");
	const startTime = Date.now();

	const result = await commitPurchaseUploadFile(
		sql as any,
		file,
		"full_replace",
	);

	if (!result.success) {
		console.error("❌ Purchase import failed:", result.error);
		if (result.quarantineReasons?.length) {
			console.error(result.quarantineReasons.slice(0, 5).join("\n"));
		}
		process.exit(1);
	}

	console.log(
		`\n✅ Purchase seeding complete in ${((Date.now() - startTime) / 1000).toFixed(2)}s!`,
	);
	console.log(`Batch ID: ${result.batchId}`);
	console.log(`Rows Inserted: ${result.rowsInserted}`);
	console.log(`Quarantined: ${result.quarantined}`);
	console.log(
		`Date Range: ${result.dateRange?.start} to ${result.dateRange?.end}`,
	);
	console.log(`Net Purchase: ${result.netPurchase}`);
	console.log(`Store normalization:`, result.normalizationReport);
}

main().catch((err) => {
	console.error("Unexpected error in purchase seeding:", err);
	process.exit(1);
});
