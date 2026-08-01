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

import {
	type OdooProduct,
	type OdooSalesLine,
	type OdooSalesOrder,
	type OdooStore,
	upsertProducts,
	upsertSalesLines,
	upsertSalesOrders,
	upsertStores,
} from "../lib/repositories/odoo.repository";

async function main() {
	const { sql } = await import("../lib/db");
	const { OdooClient } = await import("../lib/odoo/client");

	console.log("\n=======================================================");
	console.log(
		"=== EXECUTING CATCH-UP RECONCILIATION FOR 31 JUL & 01 AUG 2026 IST ===",
	);
	console.log("=======================================================\n");

	const client = new OdooClient();
	if (client.getMockModeStatus()) {
		console.error(
			"❌ Odoo credentials missing. Cannot run live reconciliation.",
		);
		process.exit(1);
	}

	await client.authenticate();

	// 1. Ensure POS Config stores are mapped
	try {
		const configs = await client.callKw<any[]>(
			"pos.config",
			"search_read",
			[],
			{
				fields: ["id", "name"],
			},
		);
		if (configs && configs.length > 0) {
			const storesToUpsert: OdooStore[] = configs.map((c) => {
				let code = "STORE";
				const nameLower = String(c.name).toLowerCase();
				if (nameLower.includes("zenzebra")) code = "ZZ";
				else if (nameLower.includes("klj")) code = "KLJ";
				else if (nameLower.includes("swn") || nameLower.includes("smartworks"))
					code = "SWN";
				return { id: Number(c.id), name: String(c.name), code };
			});
			await upsertStores(storesToUpsert);
		}
	} catch (err: any) {
		console.warn(
			"⚠️ POS Store config fetch failed, inserting defaults:",
			err.message,
		);
		await upsertStores([
			{ id: 1, name: "ZenZebra (Flagship Store)", code: "ZZ" },
			{ id: 2, name: "KLJ Noida Store", code: "KLJ" },
			{ id: 3, name: "Smartworks Noida Store", code: "SWN" },
		]);
	}

	const targets = [
		{
			label: "31 Jul 2026 IST",
			dateStr: "2026-07-31",
			istStartUtc: "2026-07-30 18:30:00",
			istEndUtc: "2026-07-31 18:29:59",
		},
		{
			label: "01 Aug 2026 IST",
			dateStr: "2026-08-01",
			istStartUtc: "2026-07-31 18:30:00",
			istEndUtc: "2026-08-01 18:29:59",
		},
	];

	for (const target of targets) {
		console.log(
			`\n------------------------------------------------------------------`,
		);
		console.log(`RECONCILING TARGET DATE: ${target.label}`);
		console.log(
			`------------------------------------------------------------------`,
		);

		// Fetch all confirmed POS orders from Odoo for target window
		const posOrdersOdoo = await client.callKw<any[]>(
			"pos.order",
			"search_read",
			[],
			{
				domain: [
					["state", "in", ["paid", "done", "invoiced"]],
					["date_order", ">=", `${target.dateStr} 00:00:00`],
					["date_order", "<=", `${target.dateStr} 23:59:59`],
				],
				fields: [
					"id",
					"name",
					"date_order",
					"partner_id",
					"amount_total",
					"amount_tax",
					"state",
					"config_id",
					"lines",
				],
			},
		);

		console.log(
			`[Odoo Live Ground Truth] POS Orders count for ${target.label}: ${posOrdersOdoo.length}`,
		);

		// Map & Upsert Orders
		const posOrdersToUpsert: OdooSalesOrder[] = posOrdersOdoo.map(
			(rec: any) => {
				const partnerId = Array.isArray(rec.partner_id)
					? Number(rec.partner_id[0])
					: null;
				const storeId = Array.isArray(rec.config_id)
					? Number(rec.config_id[0])
					: null;
				const totalAmount = Number(rec.amount_total || 0);
				const taxAmount = Number(rec.amount_tax || 0);

				const rawDate = String(rec.date_order || "");
				const utcDateStr = rawDate.includes("T")
					? rawDate
					: `${rawDate.replace(" ", "T")}Z`;
				return {
					id: `pos_${rec.id}`,
					name: String(rec.name),
					dateOrder: new Date(utcDateStr).toISOString(),
					partnerId,
					storeId,
					amountTotal: totalAmount,
					amountUntaxed: totalAmount - taxAmount,
					state: String(rec.state),
					orderType: "pos",
				};
			},
		);

		await upsertSalesOrders(posOrdersToUpsert);

		// Extract lines for POS orders
		const posLineIds = posOrdersOdoo
			.flatMap((rec: any) => rec.lines || [])
			.map(Number);
		if (posLineIds.length > 0) {
			const rawLines = await client.callKw<any[]>(
				"pos.order.line",
				"search_read",
				[],
				{
					domain: [["id", "in", posLineIds]],
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

			const salesLinesToUpsert: OdooSalesLine[] = rawLines.map((l: any) => {
				const orderId = Array.isArray(l.order_id) ? `pos_${l.order_id[0]}` : "";
				const productId = Array.isArray(l.product_id)
					? Number(l.product_id[0])
					: 0;
				const priceSubtotal = Number(l.price_subtotal || 0);
				const taxAmount = Number(l.price_subtotal_incl || 0) - priceSubtotal;

				return {
					id: `pos_line_${l.id}`,
					orderId,
					productId,
					priceUnit: Number(l.price_unit || 0),
					discount: Number(l.discount || 0),
					qty: Number(l.qty || 0),
					priceSubtotal,
					taxAmount,
				};
			});

			const missingProductIds = await upsertSalesLines(salesLinesToUpsert);
			if (missingProductIds.length > 0) {
				console.log(
					`Auto-recovering ${missingProductIds.length} missing product IDs (including archived):`,
					missingProductIds,
				);
				const missingProds = await client.callKw<any[]>(
					"product.product",
					"search_read",
					[],
					{
						domain: [
							["id", "in", missingProductIds],
							["active", "in", [true, false]],
						],
						fields: [
							"id",
							"name",
							"default_code",
							"barcode",
							"list_price",
							"standard_price",
							"qty_available",
							"free_qty",
							"active",
							"categ_id",
						],
					},
				);

				if (missingProds && missingProds.length > 0) {
					const productsToUpsert: OdooProduct[] = missingProds.map(
						(rec: any) => ({
							id: Number(rec.id),
							name: String(rec.name),
							defaultCode: rec.default_code
								? String(rec.default_code)
								: undefined,
							barcode: rec.barcode ? String(rec.barcode) : undefined,
							listPrice: rec.list_price ? Number(rec.list_price) : 0,
							costPrice: rec.standard_price ? Number(rec.standard_price) : 0,
							qtyAvailable: rec.qty_available ? Number(rec.qty_available) : 0,
							freeQty: rec.free_qty ? Number(rec.free_qty) : 0,
							active: Boolean(rec.active !== false),
							category: Array.isArray(rec.categ_id)
								? String(rec.categ_id[1])
								: undefined,
						}),
					);
					await upsertProducts(productsToUpsert);
				}
				await upsertSalesLines(salesLinesToUpsert);
			}
		}

		// Prune stale/draft orders in DB that do not exist in live confirmed Odoo set for this window
		const odooPosIds = new Set(posOrdersToUpsert.map((o) => o.id));
		const dbOrdersInWindow = await sql`
			SELECT id FROM fact_sales_orders
			WHERE (date_order AT TIME ZONE 'Asia/Kolkata')::date = ${target.dateStr}::date
			  AND order_type = 'pos'
		`;

		const staleOrderIds = dbOrdersInWindow
			.map((r) => r.id)
			.filter((id) => !odooPosIds.has(id));
		if (staleOrderIds.length > 0) {
			console.log(
				`Cleaning up ${staleOrderIds.length} stale/draft orders from DB:`,
				staleOrderIds,
			);
			await sql`DELETE FROM fact_sales_lines WHERE order_id = ANY(${staleOrderIds})`;
			await sql`DELETE FROM fact_sales_orders WHERE id = ANY(${staleOrderIds})`;
		}

		console.log(
			`✅ ${target.label} reconciliation complete! Verified ${posOrdersToUpsert.length} orders.`,
		);
	}

	console.log("\n=======================================================");
	console.log("=== CATCH-UP RECONCILIATION FINISHED ===");
	console.log("=======================================================\n");
}

main().catch((err) => {
	console.error("❌ Catch-up reconciliation failed:", err);
	process.exit(1);
});
