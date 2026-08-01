import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import { commitFounderUploadFile } from "../lib/founder/import-service";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL in environment.");
		process.exit(1);
	}

	const filePath =
		"/Users/diwakarkumarbhagat/Downloads/18 nov 2025 - 15 june 2026.xlsx";
	if (!fs.existsSync(filePath)) {
		console.error(`Baseline Excel file not found at: ${filePath}`);
		process.exit(1);
	}

	console.log(`Loading Excel file from: ${filePath}...`);
	const buffer = fs.readFileSync(filePath);

	// Construct a File-like object for the import service
	const file = new File([buffer], "18 nov 2025 - 15 june 2026.xlsx", {
		type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	});

	const sql = neon(process.env.DATABASE_URL);
	console.log("Starting transactional import...");
	const startTime = Date.now();

	const result = await commitFounderUploadFile(
		sql as any,
		file,
		"full_replace",
	);

	if (!result.success) {
		console.error("❌ Import failed:", result.error);
		if (result.validation?.errors) {
			console.error(
				JSON.stringify(result.validation.errors.slice(0, 5), null, 2),
			);
		}
		process.exit(1);
	}

	console.log(
		`\n✅ Seeding complete in ${((Date.now() - startTime) / 1000).toFixed(2)}s!`,
	);
	console.log(`Batch ID: ${result.batchId}`);
	console.log(`Rows Inserted: ${result.rowsInserted}`);
	console.log(
		`Date Range: ${result.validation.dateRange.start} to ${result.validation.dateRange.end}`,
	);
}

main().catch((err) => {
	console.error("Unexpected error in seeding:", err);
	process.exit(1);
});
