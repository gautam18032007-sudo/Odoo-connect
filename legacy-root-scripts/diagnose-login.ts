import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
	try {
		// Check all tables
		const tables = await sql`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' ORDER BY table_name
    `;
		console.log(
			"All tables:",
			tables.map((t: any) => t.table_name),
		);

		// Check sessions table specifically
		const sessionsExist = tables.some((t: any) => t.table_name === "sessions");
		console.log("Sessions table exists:", sessionsExist);

		if (!sessionsExist) {
			console.log("\n❌ Sessions table is MISSING! Creating it now...");
			await sql`
        CREATE TABLE IF NOT EXISTS sessions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `;
			console.log("✅ Sessions table created!");
		} else {
			// Try a simple login simulation
			const users = await sql`
        SELECT id, username, password_hash, is_active FROM users WHERE username = 'zebra'
      `;
			console.log("\nUser record:", users[0]);

			// Check if is_active is actually true
			const user = users[0] as any;
			console.log(
				"is_active value:",
				user?.is_active,
				"type:",
				typeof user?.is_active,
			);
			console.log("is_active truthy check:", !!user?.is_active);
		}
	} catch (err: any) {
		console.error("Error:", err.message);
	}
}

main();
