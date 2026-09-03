import * as path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
	console.log("==================================================");
	console.log("🔍 Running Odoo SaaS Live Capabilities Verification...");
	console.log("==================================================");

	const { OdooClient } = await import("../../lib/odoo/client");
	const client = new OdooClient();

	if (client.getMockModeStatus()) {
		console.error(
			"❌ Error: Client is in Mock Mode. Please set Odoo credentials in .env.local.",
		);
		process.exit(1);
	}

	try {
		console.log("Authenticating...");
		await client.authenticate();

		// 1. Check standard_price (COGS)
		console.log("\n--------------------------------------------------");
		console.log("1. Checking standard_price on product.product...");
		const products = await client.callKw<any[]>(
			"product.product",
			"search_read",
			[],
			{
				fields: ["id", "name", "standard_price", "list_price"],
				limit: 1,
			},
		);
		if (products && products.length > 0) {
			console.log("Result:", JSON.stringify(products[0], null, 2));
			console.log(`- ID: ${products[0].id}`);
			console.log(`- Name: ${products[0].name}`);
			console.log(`- List Price (Retail): ${products[0].list_price}`);
			console.log(`- Standard Price (Cost): ${products[0].standard_price}`);
			if (typeof products[0].standard_price === "number") {
				console.log(
					"✅ Check 1 Passed: standard_price is readable and is a number.",
				);
			} else {
				console.log(
					"❌ Check 1 Failed: standard_price is missing or not a number.",
				);
			}
		} else {
			console.log("⚠️ No products found to test.");
		}

		// 2. Check qty_available and inventory fields
		console.log("\n--------------------------------------------------");
		console.log("2. Checking inventory fields on product.product...");
		// Use try-catch in case some forecasted fields are restricted
		try {
			const invProducts = await client.callKw<any[]>(
				"product.product",
				"search_read",
				[],
				{
					fields: [
						"id",
						"name",
						"qty_available",
						"free_qty",
						"virtual_available",
					],
					limit: 1,
				},
			);
			if (invProducts && invProducts.length > 0) {
				console.log("Result:", JSON.stringify(invProducts[0], null, 2));
				console.log(`- Quantity Available: ${invProducts[0].qty_available}`);
				console.log(`- Free Qty: ${invProducts[0].free_qty}`);
				console.log(
					`- Forecast Qty (virtual_available): ${invProducts[0].virtual_available}`,
				);
				console.log("✅ Check 2 Passed: Inventory fields returned values.");
			} else {
				console.log("⚠️ No products found to test inventory fields.");
			}
		} catch (err: any) {
			console.log("❌ Check 2 Failed with error:", err.message);
		}

		// 3. Check pos.order.line fields (discount, subtotal, unit price, qty)
		console.log("\n--------------------------------------------------");
		console.log("3. Checking pos.order.line fields...");
		try {
			const posLines = await client.callKw<any[]>(
				"pos.order.line",
				"search_read",
				[],
				{
					fields: [
						"id",
						"order_id",
						"product_id",
						"price_unit",
						"discount",
						"qty",
						"price_subtotal",
					],
					limit: 1,
				},
			);
			if (posLines && posLines.length > 0) {
				console.log("Result:", JSON.stringify(posLines[0], null, 2));
				console.log(`- Price Unit: ${posLines[0].price_unit}`);
				console.log(`- Discount (%): ${posLines[0].discount}`);
				console.log(`- Quantity: ${posLines[0].qty}`);
				console.log(`- Subtotal: ${posLines[0].price_subtotal}`);
				console.log("✅ Check 3 Passed: pos.order.line fields are readable.");
			} else {
				console.log("⚠️ No POS order lines found to test.");
			}
		} catch (err: any) {
			console.log("❌ Check 3 Failed with error:", err.message);
		}

		// 4. Check Offset Pagination
		console.log("\n--------------------------------------------------");
		console.log("4. Verifying Pagination Offsets...");
		const page1 = await client.callKw<any[]>(
			"product.product",
			"search_read",
			[],
			{
				fields: ["id", "name"],
				limit: 1,
				offset: 0,
			},
		);
		const page2 = await client.callKw<any[]>(
			"product.product",
			"search_read",
			[],
			{
				fields: ["id", "name"],
				limit: 1,
				offset: 1,
			},
		);

		if (page1.length > 0 && page2.length > 0) {
			console.log(
				"Page 1 (offset 0) first ID:",
				page1[0].id,
				`(${page1[0].name})`,
			);
			console.log(
				"Page 2 (offset 1) first ID:",
				page2[0].id,
				`(${page2[0].name})`,
			);
			if (page1[0].id !== page2[0].id) {
				console.log(
					"✅ Check 4 Passed: Pagination offset works correctly (returned different IDs).",
				);
			} else {
				console.log(
					"❌ Check 4 Failed: Offset ignored (returned duplicate ID).",
				);
			}
		} else {
			console.log("⚠️ Not enough products to perform pagination test.");
		}

		// 5. Check Incremental Sync (write_date)
		console.log("\n--------------------------------------------------");
		console.log("5. Checking write_date field...");
		const writeDates = await client.callKw<any[]>(
			"product.product",
			"search_read",
			[],
			{
				fields: ["id", "write_date"],
				limit: 1,
			},
		);
		if (writeDates && writeDates.length > 0) {
			console.log("Result:", JSON.stringify(writeDates[0], null, 2));
			console.log(`- Write Date: ${writeDates[0].write_date}`);
			if (writeDates[0].write_date) {
				console.log("✅ Check 5 Passed: write_date is readable and populated.");
			} else {
				console.log("❌ Check 5 Failed: write_date is missing or null.");
			}
		} else {
			console.log("⚠️ No records found to check write_date.");
		}

		console.log("\n==================================================");
		console.log("🏁 Live Capabilities Verification Completed!");
		console.log("==================================================");
	} catch (err: any) {
		console.error("\n❌ Critical connection error:", err.message || err);
	}
}

main();
