import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function populateCostMaster() {
	if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
	const sql = neon(process.env.DATABASE_URL);

	console.log("Populating product_master for 100% SKU match coverage...");

	// 1. Insert from dim_products (Odoo synced products)
	await sql`
		INSERT INTO product_master (product_key, sku_code, product_name, category, mrp, purchase_price, active, updated_at)
		SELECT 
			'odoo_' || id AS product_key,
			COALESCE(default_code, barcode, 'odoo_' || id) AS sku_code,
			name AS product_name,
			'General' AS category,
			list_price AS mrp,
			cost_price AS purchase_price,
			active,
			NOW()
		FROM dim_products
		ON CONFLICT (product_key) DO UPDATE SET
			mrp = EXCLUDED.mrp,
			purchase_price = EXCLUDED.purchase_price,
			updated_at = NOW();
	`;

	// 2. Insert for all distinct sku_code values present in sales_fact_v
	await sql`
		INSERT INTO product_master (product_key, sku_code, product_name, category, mrp, purchase_price, active, updated_at)
		SELECT 
			'sku_' || s.sku_code AS product_key,
			s.sku_code AS sku_code,
			MAX(s.item_name) AS product_name,
			'General' AS category,
			MAX(s.mrp_amount / NULLIF(s.quantity, 0)) AS mrp,
			ROUND((MAX(s.mrp_amount / NULLIF(s.quantity, 0)) * 0.70)::numeric, 2) AS purchase_price,
			true AS active,
			NOW()
		FROM sales_fact_v s
		WHERE s.sku_code IS NOT NULL AND s.sku_code <> ''
		GROUP BY s.sku_code
		ON CONFLICT (product_key) DO UPDATE SET
			mrp = CASE WHEN product_master.mrp = 0 THEN EXCLUDED.mrp ELSE product_master.mrp END,
			purchase_price = CASE WHEN product_master.purchase_price = 0 THEN EXCLUDED.purchase_price ELSE product_master.purchase_price END;
	`;

	// 3. Also make sure sku_code is populated when joining by s.sku_code = pm.sku_code
	await sql`
		INSERT INTO product_master (product_key, sku_code, product_name, category, mrp, purchase_price, active, updated_at)
		SELECT 
			s.sku_code AS product_key,
			s.sku_code AS sku_code,
			MAX(s.item_name) AS product_name,
			'General' AS category,
			MAX(s.mrp_amount / NULLIF(s.quantity, 0)) AS mrp,
			ROUND((MAX(s.mrp_amount / NULLIF(s.quantity, 0)) * 0.70)::numeric, 2) AS purchase_price,
			true AS active,
			NOW()
		FROM sales_fact_v s
		WHERE s.sku_code IS NOT NULL AND s.sku_code <> ''
		GROUP BY s.sku_code
		ON CONFLICT (product_key) DO UPDATE SET
			sku_code = EXCLUDED.sku_code,
			purchase_price = CASE WHEN product_master.purchase_price = 0 THEN EXCLUDED.purchase_price ELSE product_master.purchase_price END;
	`;

	const [count] =
		await sql`SELECT COUNT(*)::int AS rows, COUNT(*) FILTER (WHERE purchase_price > 0)::int AS priced FROM product_master`;
	console.log(
		`✅ product_master updated: ${count.rows} rows, ${count.priced} priced.`,
	);
}

populateCostMaster().catch((err) => {
	console.error("Error populating cost master:", err);
	process.exit(1);
});
