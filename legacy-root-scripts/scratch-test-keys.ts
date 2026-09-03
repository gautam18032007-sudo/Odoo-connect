import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL");
		process.exit(1);
	}
	const sql = neon(process.env.DATABASE_URL);
	console.log("Keys of sql function:", Object.keys(sql));
	console.log(
		"Is sql.transaction defined?",
		(sql as any).transaction !== undefined,
	);
	console.log("Type of sql.transaction:", typeof (sql as any).transaction);
}

main().catch(console.error);
