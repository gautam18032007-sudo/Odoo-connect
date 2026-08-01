import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import * as XLSX from "xlsx";
import {
	commitStagedInventoryUpload,
	stageInventoryUploadChunk,
	startInventoryUploadBatch,
} from "../lib/founder/inventory-import-service";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
	if (!process.env.DATABASE_URL) {
		console.error("❌ Missing DATABASE_URL in environment.");
		process.exit(1);
	}

	const filePath =
		"/Users/diwakarkumarbhagat/Downloads/active stock pricing (1).xlsx";
	if (!fs.existsSync(filePath)) {
		console.error(`❌ Baseline Excel file not found at: ${filePath}`);
		process.exit(1);
	}

	console.log(`📂 Loading Excel file from: ${filePath}...`);
	const buffer = fs.readFileSync(filePath);
	const workbook = XLSX.read(buffer, { type: "buffer" });
	const sheetName = workbook.SheetNames[0];
	const worksheet = workbook.Sheets[sheetName];
	const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
		defval: null,
	});

	console.log(`📊 Parsed ${rawRows.length} raw rows from Excel sheet.`);

	const sql = neon(process.env.DATABASE_URL);
	console.log("⚡ Starting transactional inventory upload...");
	const startTime = Date.now();

	// 1. Start batch
	const filename = path.basename(filePath);
	const batchResult = await startInventoryUploadBatch(sql as any, filename);
	const batchId = batchResult.data.batchId;
	console.log(`⚙️ Allocated Batch ID: ${batchId}`);

	// 2. Stage rows in chunks
	const CHUNK_SIZE = 1000;
	for (let i = 0; i < rawRows.length; i += CHUNK_SIZE) {
		const chunk = rawRows.slice(i, i + CHUNK_SIZE);
		const chunkIndex = Math.floor(i / CHUNK_SIZE);
		console.log(`📤 Staging chunk ${chunkIndex + 1} (${chunk.length} rows)...`);
		await stageInventoryUploadChunk(sql as any, batchId, chunkIndex, chunk);
	}

	// 3. Commit staged upload
	console.log(
		"💾 Committing staged rows (validating and upserting into database)...",
	);
	const result = await commitStagedInventoryUpload(
		sql as any,
		batchId,
		"full_replace",
	);

	if (!result.success) {
		console.error("❌ Import failed:", result.error);
		if (result.validation?.quarantineReasons) {
			console.error(
				"Quarantine Reasons:",
				JSON.stringify(
					result.validation.quarantineReasons.slice(0, 5),
					null,
					2,
				),
			);
		}
		process.exit(1);
	}

	console.log(
		`\n✅ Seeding complete in ${((Date.now() - startTime) / 1000).toFixed(2)}s!`,
	);
	console.log(`Batch ID: ${result.batchId}`);
	console.log(`Rows Inserted: ${result.rowsInserted}`);
}

main().catch((err) => {
	console.error("Unexpected error in seeding:", err);
	process.exit(1);
});
