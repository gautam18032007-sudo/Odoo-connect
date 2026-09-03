import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
	try {
		// Check sessions table schema
		const cols = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sessions'
      ORDER BY ordinal_position
    `;
		console.log("Sessions table schema:");
		console.table(cols);

		// Try a test session insert with user id=3 (zebra)
		const crypto = await import("crypto");
		const token = crypto.randomBytes(32).toString("hex");
		const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
		const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

		console.log("\nTrying to insert test session...");
		const result = await sql`
      INSERT INTO sessions (user_id, token_hash, expires_at)
      VALUES (${3}, ${tokenHash}, ${expiresAt})
      RETURNING id
    `;
		console.log("✅ Session insert succeeded:", result);

		// Clean up
		await sql`DELETE FROM sessions WHERE token_hash = ${tokenHash}`;
		console.log("✅ Cleaned up test session");
	} catch (err: any) {
		console.error("❌ Error:", err.message);
	}
}

main();
