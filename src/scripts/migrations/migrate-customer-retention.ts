import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function migrate() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL");
		process.exit(1);
	}
	const sql = neon(process.env.DATABASE_URL);
	console.log("Connecting to database...");

	console.log("Creating customer_metrics view...");
	await sql`
    CREATE OR REPLACE VIEW customer_metrics AS
    SELECT
      customer_mobile,
      MAX(customer_name) AS customer_name,
      MIN(sale_date) AS first_purchase_date,
      MAX(sale_date) AS last_purchase_date,
      COUNT(DISTINCT bill_no) AS total_orders,
      SUM(net_amount) AS total_revenue,
      SUM(net_amount) / NULLIF(COUNT(DISTINCT bill_no), 0) AS aov,
      CASE
        WHEN COUNT(DISTINCT bill_no) > 1 THEN
          (MAX(sale_date) - MIN(sale_date))::numeric / (COUNT(DISTINCT bill_no) - 1)
        ELSE NULL
      END AS avg_purchase_gap_days
    FROM sales_fact_v
    WHERE customer_mobile IS NOT NULL AND customer_mobile <> ''
    GROUP BY customer_mobile;
  `;

	console.log("Creating customer_ltv view...");
	await sql`
    CREATE OR REPLACE VIEW customer_ltv AS
    SELECT
      customer_mobile,
      customer_name,
      total_orders AS orders,
      total_revenue AS revenue,
      aov,
      total_revenue AS ltv,
      ROUND(LEAST(100, (total_orders * 10) + (100 / (1 + (CURRENT_DATE - last_purchase_date)))))::int AS retention_score
    FROM customer_metrics;
  `;

	console.log("Creating customer_segments view...");
	await sql`
    CREATE OR REPLACE VIEW customer_segments AS
    SELECT
      customer_mobile,
      customer_name,
      total_orders,
      total_revenue,
      aov,
      first_purchase_date,
      last_purchase_date,
      CASE
        WHEN total_orders = 1 THEN 'New'
        ELSE 'Returning'
      END AS segment_type
    FROM customer_metrics;
  `;

	console.log("Creating customer_retention_summary view...");
	await sql`
    CREATE OR REPLACE VIEW customer_retention_summary AS
    SELECT
      DATE_TRUNC('month', first_purchase_date)::date AS cohort_month,
      COUNT(DISTINCT customer_mobile) AS cohort_customers,
      SUM(total_revenue) AS total_cohort_revenue,
      AVG(total_revenue) AS avg_cohort_ltv
    FROM customer_metrics
    GROUP BY cohort_month;
  `;

	console.log("Creating extra database indexes...");
	await sql`CREATE INDEX IF NOT EXISTS idx_sales_fact_customer_mobile ON sales_fact (customer_mobile);`;
	await sql`CREATE INDEX IF NOT EXISTS idx_sales_fact_sale_date ON sales_fact (sale_date);`;
	await sql`CREATE INDEX IF NOT EXISTS idx_sales_fact_billed_by ON sales_fact (billed_by);`;

	console.log("✅ Database retention views & indexes migrated successfully!");
}

migrate().catch((err) => {
	console.error("❌ Migration failed:", err);
	process.exit(1);
});
