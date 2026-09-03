import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { sql } from "../src/lib/db";

async function main() {
	try {
		// Check if users table exists
		const tables = await sql`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'users'
    `;
		console.log("Users table exists:", tables.length > 0);

		if (tables.length > 0) {
			const users = await sql`SELECT id, username, is_active FROM users`;
			console.log("Existing users:", users);
		} else {
			console.log("No 'users' table found! Need to create it.");
			// Show all tables
			const allTables = await sql`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public'
      `;
			console.log(
				"Available tables:",
				allTables.map((t: any) => t.table_name),
			);
		}
	} catch (err: any) {
		console.error("Error:", err.message);
	}
}

main();
