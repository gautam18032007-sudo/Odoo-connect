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
	console.log("Querying sequence...");
	const res = await sql`
		SELECT nextval(pg_get_serial_sequence('upload_batches', 'id'))::integer AS id
	`;
	console.log("Result:", res);
}

main().catch(console.error);
