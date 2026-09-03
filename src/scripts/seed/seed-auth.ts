import crypto from "node:crypto";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { hash } from "@node-rs/argon2";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const ARGON2_OPTIONS = {
	algorithm: 2,
	memoryCost: 65536,
	timeCost: 3,
	parallelism: 4,
} as const;

async function seed() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL");
		process.exit(1);
	}

	const sql = neon(process.env.DATABASE_URL);

	// Security remediation (DEFECT-110, Phase 2): no account here has a
	// hardcoded password — every seeded account gets its own random,
	// generated-at-run-time password, printed once and never stored in
	// source control. `users` was confirmed empty (0 rows) at the time of
	// this fix, so no existing login is affected by this change.
	// "diwakarpro01" was the original production login; it was retired in
	// favor of "zebra" and intentionally removed from this list so an
	// accidental re-run of this script cannot recreate it.
	const users = [
		{ employee_id: "EMP002", name: "Gautam", username: "gautam12" },
		{ employee_id: "ZEBRA001", name: "Zebra", username: "zebra" },
	];

	console.log("\n=== ZenZebra Auth Seed ===\n");
	console.log("Generating credentials...\n");

	for (const user of users) {
		// Every account gets a fresh, randomly generated 12-char password.
		const password = crypto.randomBytes(8).toString("base64url").slice(0, 12);

		// Hash with Argon2id
		const passwordHash = await hash(password, ARGON2_OPTIONS);

		// Check if user already exists
		const existing =
			await sql`SELECT id FROM users WHERE username = ${user.username}`;
		if (existing.length > 0) {
			console.log(`User "${user.username}" already exists — skipping.`);
			continue;
		}

		await sql`
      INSERT INTO users (employee_id, name, username, password_hash)
      VALUES (${user.employee_id}, ${user.name}, ${user.username}, ${passwordHash})
    `;

		console.log(`  Employee: ${user.name}`);
		console.log(`  ID:       ${user.employee_id}`);
		console.log(`  Username: ${user.username}`);
		console.log(`  Password: ${password}`);
		console.log(`  ─────────────────────────────`);
	}

	console.log("\n⚠  Save these credentials. They will NOT be shown again.\n");
}

seed().catch((err) => {
	console.error("Seed failed:", err);
	process.exit(1);
});
