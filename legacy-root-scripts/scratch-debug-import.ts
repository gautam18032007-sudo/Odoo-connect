import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { commitFounderUploadFile } from "../src/lib/founder/import-service";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
	console.log("Connecting...");
	const sql = neon(process.env.DATABASE_URL!);
	const filePath =
		"/Users/diwakarkumarbhagat/Downloads/18 nov 2025 - 15 june 2026.xlsx";

	console.log("Reading file...");
	const buffer = fs.readFileSync(filePath);

	console.log("Creating File object...");
	const file = new File([buffer], "18 nov 2025 - 15 june 2026.xlsx", {
		type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	});

	console.log("Calling commit...");
	const result = await commitFounderUploadFile(
		sql as any,
		file,
		"full_replace",
	);
	console.log(
		"Commit result success:",
		result.success,
		"error:",
		(result as any).error,
	);
}
main().catch(console.error);
