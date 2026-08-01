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

	const sql = neon(process.env.DATABASE_URL);
	const startTotalTime = Date.now();

	// 1. Import net purchase.xlsx as sales (full_replace)
	const file1Path = "/Users/diwakarkumarbhagat/Downloads/net purchase.xlsx";
	if (!fs.existsSync(file1Path)) {
		console.error(`❌ Sales base file not found at: ${file1Path}`);
		process.exit(1);
	}
	console.log(`📂 Loading base sales file: ${file1Path}...`);
	const buffer1 = fs.readFileSync(file1Path);
	const file1 = new File([buffer1], "net purchase.xlsx", {
		type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	});

	console.log("⚡ Importing base sales (full_replace)...");
	const result1 = await commitFounderUploadFile(
		sql as any,
		file1,
		"full_replace",
	);
	if (!result1.success) {
		console.error("❌ Base sales import failed:", result1.error);
		process.exit(1);
	}
	console.log(
		`✅ Base sales imported. Batch: ${result1.batchId}, Rows: ${result1.rowsInserted}`,
	);

	// 2. Import 25th june.xlsx as sales (incremental)
	const file2Path = "/Users/diwakarkumarbhagat/Downloads/25th june.xlsx";
	if (!fs.existsSync(file2Path)) {
		console.error(`❌ Incremental sales file not found at: ${file2Path}`);
		process.exit(1);
	}
	console.log(`📂 Loading incremental sales file: ${file2Path}...`);
	const buffer2 = fs.readFileSync(file2Path);
	const file2 = new File([buffer2], "25th june.xlsx", {
		type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	});

	console.log("⚡ Importing incremental sales (incremental)...");
	const result2 = await commitFounderUploadFile(
		sql as any,
		file2,
		"incremental",
	);
	if (!result2.success) {
		console.error("❌ Incremental sales import failed:", result2.error);
		process.exit(1);
	}
	console.log(
		`✅ Incremental sales imported. Batch: ${result2.batchId}, Rows: ${result2.rowsInserted}`,
	);

	console.log(
		`\n✅ Ground truth sales seeding complete in ${((Date.now() - startTotalTime) / 1000).toFixed(2)}s!`,
	);
}

main().catch((err) => {
	console.error("Unexpected error in ground truth seeding:", err);
	process.exit(1);
});
