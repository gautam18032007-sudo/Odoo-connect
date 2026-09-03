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

	// Start data migration inside transaction
	console.log("Beginning data migration transaction...");

	try {
		// 1. Insert fallback mapping rules into store_alias_mapping to be safe
		console.log("Seeding extra normalization aliases...");
		const extraMappings = [
			{ source: "smart_works_noida", canonical: "SmartworksNoida Noida" },
			{ source: "klj", canonical: "Klj store" },
			{ source: "head office", canonical: "SmartworksNoida Noida" },
			{ source: "head_office", canonical: "SmartworksNoida Noida" },
		];

		for (const m of extraMappings) {
			await sql`
				INSERT INTO store_alias_mapping (source_name, canonical_store)
				VALUES (${m.source}, ${m.canonical})
				ON CONFLICT (source_name) DO UPDATE SET
					canonical_store = EXCLUDED.canonical_store;
			`;
		}

		// Log distribution before changes
		const initialDistribution = await sql`
			SELECT COALESCE(billed_by, 'NULL') as billed_by, COUNT(*)::int as count 
			FROM sales_fact 
			GROUP BY 1 
			ORDER BY 2 DESC
		`;
		console.log(
			"Initial billed_by distribution in sales_fact:",
			initialDistribution,
		);

		// 2. Populate source_billed_by with existing billed_by values where source_billed_by is null
		console.log("Populating source_billed_by...");
		await sql`
			UPDATE sales_fact
			SET source_billed_by = COALESCE(source_billed_by, billed_by)
			WHERE source_billed_by IS NULL OR source_billed_by = '';
		`;
		console.log(`Backfilled source_billed_by for rows.`);

		// 3. Update billed_by using alias mapping
		console.log("Applying store identity normalization on billed_by...");
		await sql`
			UPDATE sales_fact sf
			SET billed_by = sam.canonical_store
			FROM store_alias_mapping sam
			WHERE LOWER(TRIM(COALESCE(sf.source_billed_by, sf.billed_by))) = LOWER(TRIM(sam.source_name));
		`;
		console.log(`Normalized billed_by for matching rows.`);

		// 4. Update store_id referencing store_dimension
		console.log("Mapping store_id references from store_dimension...");
		await sql`
			UPDATE sales_fact sf
			SET store_id = sd.id
			FROM store_dimension sd
			WHERE sf.billed_by = sd.store_name;
		`;
		console.log(`Mapped store_id references for matching rows.`);

		// 5. Fallback unmapped stores to Noida
		console.log("Handling fallback for any remaining unmapped rows...");
		await sql`
			UPDATE sales_fact
			SET store_id = (SELECT id FROM store_dimension WHERE store_name = 'SmartworksNoida Noida'),
				billed_by = 'SmartworksNoida Noida'
			WHERE store_id IS NULL;
		`;
		console.log(`Applied fallback to SmartworksNoida Noida for unmapped rows.`);

		// 6. Recreate view sales_fact_v
		console.log("Recreating sales_fact_v view...");
		await sql`DROP VIEW IF EXISTS sales_fact_v CASCADE;`;
		await sql`
			CREATE OR REPLACE VIEW sales_fact_v AS
			SELECT
				sf.id,
				sf.upload_id,
				sf.bill_no,
				sf.sale_date,
				sf.billed_by,
				sf.product_key,
				sf.sku_code,
				sf.item_name,
				sf.brand,
				sf.category,
				sf.quantity,
				sf.mrp_amount,
				sf.discount_amount,
				sf.gross_amount,
				sf.tax_amount,
				sf.net_amount,
				sf.customer_mobile,
				sf.customer_name,
				sf.payment_method,
				sf.source_billed_by,
				sf.store_id,
				COALESCE(sd.display_name, sf.billed_by) AS store_display_name
			FROM sales_fact sf
			LEFT JOIN store_dimension sd ON sf.store_id = sd.id;
		`;
		console.log("sales_fact_v view recreated successfully.");

		// Verify final distribution
		const finalDistribution = await sql`
			SELECT billed_by, store_display_name, COUNT(*)::int as count
			FROM sales_fact_v
			GROUP BY 1, 2
			ORDER BY 3 DESC
		`;
		console.log(
			"Final normalized distribution in sales_fact_v:",
			finalDistribution,
		);

		console.log("✅ Data migration completed successfully.");
	} catch (error) {
		console.error("❌ Data migration failed:", error);
		process.exit(1);
	}
}

migrate();
