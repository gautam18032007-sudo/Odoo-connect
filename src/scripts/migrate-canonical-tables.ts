import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
	console.log("🚀 Starting Canonical Odoo Schema Migration...");

	if (!process.env.DATABASE_URL) {
		console.error("❌ Error: DATABASE_URL is not set in env variables.");
		process.exit(1);
	}

	const { sql } = await import("../lib/db");

	try {
		const sqlPath = path.resolve(
			process.cwd(),
			"src/lib/odoo/schema/canonical.sql",
		);
		console.log(`Reading schema from: ${sqlPath}`);
		const schemaDdl = fs.readFileSync(sqlPath, "utf8");

		// Strip SQL comments line-by-line first
		const cleanedDdl = schemaDdl
			.split("\n")
			.map((line) => {
				const commentIdx = line.indexOf("--");
				return commentIdx !== -1 ? line.substring(0, commentIdx) : line;
			})
			.join("\n");

		const statements = cleanedDdl
			.split(";")
			.map((s) => s.trim())
			.filter((s) => s.length > 0);

		console.log(
			`Executing ${statements.length} schema statements on Neon DB...`,
		);
		for (let i = 0; i < statements.length; i++) {
			const stmt = statements[i];
			console.log(`[${i + 1}/${statements.length}] Running statement...`);

			// Construct a TemplateStringsArray-like object to pass to the tag function
			const strings = [stmt] as any;
			strings.raw = [stmt];
			await sql(strings);
		}

		console.log("✅ Canonical Odoo tables migrated successfully!");
	} catch (err: any) {
		console.error("❌ Migration failed:", err.message || err);
		process.exit(1);
	}
}

main();
