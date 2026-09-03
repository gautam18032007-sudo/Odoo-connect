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

	console.log("Creating store_dimension table...");
	await sql`
    CREATE TABLE IF NOT EXISTS store_dimension (
      id SERIAL PRIMARY KEY,
      store_code TEXT UNIQUE NOT NULL,
      store_name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      city TEXT,
      active BOOLEAN DEFAULT TRUE,
      opened_date DATE
    );
  `;

	console.log("Creating store_alias_mapping table...");
	await sql`
    CREATE TABLE IF NOT EXISTS store_alias_mapping (
      id SERIAL PRIMARY KEY,
      source_name TEXT UNIQUE NOT NULL,
      canonical_store TEXT NOT NULL,
      active BOOLEAN DEFAULT TRUE
    );
  `;

	console.log("Adding audit and relational columns to sales_fact...");
	await sql`ALTER TABLE sales_fact ADD COLUMN IF NOT EXISTS source_billed_by TEXT;`;
	await sql`ALTER TABLE sales_fact ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES store_dimension(id);`;

	console.log("Seeding store_dimension entries...");
	await sql`
    INSERT INTO store_dimension (store_code, store_name, display_name, city)
    VALUES 
      ('SWN01', 'SmartworksNoida Noida', 'Smart Works Noida', 'Noida'),
      ('KLJ01', 'Klj store', 'KLJ', 'Delhi')
    ON CONFLICT (store_name) DO UPDATE SET
      store_code = EXCLUDED.store_code,
      display_name = EXCLUDED.display_name,
      city = EXCLUDED.city;
  `;

	console.log(
		"Seeding store_alias_mapping entries (lowercased for normalization)...",
	);
	const mappings = [
		{ source: "smartworksnoida noida", canonical: "SmartworksNoida Noida" },
		{ source: "surjeet kumar", canonical: "SmartworksNoida Noida" },
		{ source: "master admin", canonical: "SmartworksNoida Noida" },
		{ source: "smartworksggn ggn", canonical: "SmartworksNoida Noida" },
		{ source: "awfisggn ggn", canonical: "SmartworksNoida Noida" },
		{ source: "sanjam saluja", canonical: "SmartworksNoida Noida" },
		{ source: "deepanshu zz", canonical: "SmartworksNoida Noida" },
		{ source: "sonu kumar", canonical: "SmartworksNoida Noida" },
		{ source: "klj store", canonical: "Klj store" },
	];

	for (const m of mappings) {
		await sql`
      INSERT INTO store_alias_mapping (source_name, canonical_store)
      VALUES (${m.source}, ${m.canonical})
      ON CONFLICT (source_name) DO UPDATE SET
        canonical_store = EXCLUDED.canonical_store;
    `;
	}

	console.log(
		"✅ Schema migration and initial seeding completed successfully.",
	);
}

migrate().catch((err) => {
	console.error("❌ Migration failed:", err);
	process.exit(1);
});
