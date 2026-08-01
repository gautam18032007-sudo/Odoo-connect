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

	const users = [
		{ employee_id: "EMP001", name: "Diwakar Bhagat", username: "diwakarpro01" },
		{
			employee_id: "EMP002",
			name: "Gautam",
			username: "gautam12",
			password: "zebra123",
		},
		{
			employee_id: "ZEBRA001",
			name: "Zebra",
			username: "zebra",
			password: "zebra123",
		},
	];

	console.log("\n=== ZenZebra Auth Seed ===\n");
	console.log("Generating credentials...\n");

	for (const user of users) {
		// Use provided password or generate a random 12-char password
		const password =
			(user as any).password ||
			crypto.randomBytes(8).toString("base64url").slice(0, 12);

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
