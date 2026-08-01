import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function migrate() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL in environment.");
		process.exit(1);
	}

	console.log("Connecting to database...");
	const sql = neon(process.env.DATABASE_URL);

	console.log("Creating users table...");
	await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      employee_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

	console.log("Creating sessions table...");
	await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

	console.log("Creating indexes...");
	await sql`CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash);`;
	await sql`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);`;
	await sql`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);`;
	await sql`CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);`;

	console.log("Auth migration complete!");
}

migrate().catch((err) => {
	console.error("Migration failed:", err);
	process.exit(1);
});
