import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL");
		process.exit(1);
	}

	const sql = neon(process.env.DATABASE_URL);
	console.log("Setting up permanent regression benchmark tables and views...");

	// 1. Create upload_batches_benchmark
	console.log("Creating upload_batches_benchmark...");
	await sql`
		CREATE TABLE IF NOT EXISTS upload_batches_benchmark (
			LIKE upload_batches INCLUDING ALL
		);
	`;

	// 2. Create sales_fact_benchmark
	console.log("Creating sales_fact_benchmark...");
	await sql`
		CREATE TABLE IF NOT EXISTS sales_fact_benchmark (
			LIKE sales_fact INCLUDING ALL
		);
	`;

	// 3. Clear and seed upload_batches_benchmark from current upload_batches
	console.log("Seeding upload_batches_benchmark...");
	await sql`TRUNCATE TABLE upload_batches_benchmark CASCADE;`;
	await sql`
		INSERT INTO upload_batches_benchmark 
		SELECT * FROM upload_batches;
	`;

	// 4. Clear and seed sales_fact_benchmark from current sales_fact
	console.log("Seeding sales_fact_benchmark...");
	await sql`TRUNCATE TABLE sales_fact_benchmark CASCADE;`;
	await sql`
		INSERT INTO sales_fact_benchmark
		SELECT * FROM sales_fact;
	`;

	// 5. Create sales_fact_v_benchmark view
	console.log("Creating sales_fact_v_benchmark view...");
	await sql`DROP VIEW IF EXISTS sales_fact_v_benchmark CASCADE;`;
	await sql`
		CREATE OR REPLACE VIEW sales_fact_v_benchmark AS
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
		FROM sales_fact_benchmark sf
		LEFT JOIN store_dimension sd ON sf.store_id = sd.id;
	`;

	// 6. Create data_freshness_benchmark view
	console.log("Creating data_freshness_benchmark view...");
	await sql`DROP VIEW IF EXISTS data_freshness_benchmark CASCADE;`;
	await sql`
		CREATE OR REPLACE VIEW data_freshness_benchmark AS
		SELECT
			MAX(sf.sale_date) AS latest_sale_date,
			CURRENT_DATE - MAX(sf.sale_date) AS days_stale,
			COUNT(DISTINCT sf.bill_no) AS total_bills,
			SUM(sf.net_amount) AS total_revenue,
			MAX(ub.uploaded_at) AS last_upload_at
		FROM sales_fact_benchmark sf
		JOIN upload_batches_benchmark ub ON sf.upload_id = ub.id;
	`;

	console.log("✅ Benchmark schema setup and seeding completed successfully.");
}

main().catch((err) => {
	console.error("Failed to setup benchmark schema:", err);
	process.exit(1);
});
