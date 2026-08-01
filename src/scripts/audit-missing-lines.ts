import * as fs from "node:fs";
import * as path from "node:path";

// Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
	const envConfig = fs.readFileSync(envPath, "utf8");
	for (const line of envConfig.split("\n")) {
		const trimmed = line.trim();
		if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
			const [key, ...valueParts] = trimmed.split("=");
			const value = valueParts.join("=").replace(/^["']|["']$/g, "");
			if (key && !process.env[key.trim()]) {
				process.env[key.trim()] = value;
			}
		}
	}
}

async function main() {
	const { sql } = await import("../lib/db");
	const { OdooClient } = await import("../lib/odoo/client");

	console.log("\n=======================================================");
	console.log("=== MISSING LINES ROOT CAUSE AUDIT ===");
	console.log("=======================================================\n");

	// 1. Get sample order without lines (e.g. pos_1443 -> id 1443 in Odoo)
	const missingOrderIds = await sql`
		SELECT fo.id, fo.name
		FROM fact_sales_orders fo
		LEFT JOIN fact_sales_lines fl ON fo.id = fl.order_id
		WHERE fo.date_order::date = '2026-07-31'::date
		  AND fl.id IS NULL
		LIMIT 10
	`;
	console.log("Missing orders count:", missingOrderIds.length);

	const client = new OdooClient();
	if (!client.getMockModeStatus()) {
		await client.authenticate();

		const rawOdooIds = missingOrderIds.map((o) =>
			Number(String(o.id).replace("pos_", "")),
		);
		console.log("Querying Odoo for pos.order IDs:", rawOdooIds);

		const odooOrders = await client.callKw<any[]>(
			"pos.order",
			"search_read",
			[],
			{
				domain: [["id", "in", rawOdooIds]],
				fields: ["id", "name", "lines"],
			},
		);
		console.log("\nOdoo order search_read result:");
		console.table(
			odooOrders.map((o) => ({
				id: o.id,
				name: o.name,
				linesCount: o.lines?.length,
			})),
		);

		const allLineIds = odooOrders.flatMap((o) => o.lines || []);
		console.log(
			`\nFetching ${allLineIds.length} POS order line IDs from Odoo:`,
			allLineIds,
		);

		const odooLines = await client.callKw<any[]>(
			"pos.order.line",
			"search_read",
			[],
			{
				domain: [["id", "in", allLineIds]],
				fields: [
					"id",
					"order_id",
					"product_id",
					"price_unit",
					"discount",
					"qty",
					"price_subtotal",
					"price_subtotal_incl",
				],
			},
		);
		console.log(`Received ${odooLines.length} lines from Odoo.`);

		// Check if product_ids exist in dim_products
		const productIdsInLines = [
			...new Set(
				odooLines.map((l) =>
					Array.isArray(l.product_id)
						? Number(l.product_id[0])
						: Number(l.product_id),
				),
			),
		];
		console.log(
			`\nProduct IDs referenced in lines (${productIdsInLines.length} distinct):`,
			productIdsInLines,
		);

		const dbProducts = await sql`
			SELECT id, name FROM dim_products WHERE id = ANY(${productIdsInLines})
		`;
		const dbProductIds = new Set(dbProducts.map((p) => Number(p.id)));

		const missingProductIds = productIdsInLines.filter(
			(id) => !dbProductIds.has(id),
		);
		console.log(
			`\nProduct IDs MISSING from dim_products (${missingProductIds.length}):`,
			missingProductIds,
		);
	}

	console.log("\n=======================================================\n");
}

main().catch(console.error);
