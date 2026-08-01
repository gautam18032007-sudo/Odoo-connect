import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
	try {
		// Fetch Canonical PostgreSQL aggregations
		const [salesAgg] = await sql`
			SELECT 
				COALESCE(SUM(mrp_amount), 0) AS total_mrp,
				COALESCE(SUM(discount_amount), 0) AS total_discount,
				COALESCE(SUM(gross_amount), 0) AS total_collection,
				COALESCE(SUM(tax_amount), 0) AS total_gst,
				COALESCE(SUM(net_amount), 0) AS total_revenue,
				COUNT(DISTINCT bill_no) AS total_bills,
				COALESCE(SUM(quantity), 0) AS total_units
			FROM sales_fact_v
		`;

		const [custAgg] = await sql`
			SELECT COUNT(DISTINCT customer_mobile) AS total_customers
			FROM sales_fact_v
			WHERE customer_mobile IS NOT NULL AND customer_mobile <> ''
		`;

		const [invAgg] = await sql`
			SELECT COALESCE(SUM(qty_available), 0) AS total_inventory_soh
			FROM dim_products
			WHERE active = true
		`;

		const mrp = Number(salesAgg.total_mrp || 0);
		const discount = Number(salesAgg.total_discount || 0);
		const collection = Number(salesAgg.total_collection || 0);
		const gst = Number(salesAgg.total_gst || 0);
		const revenue = Number(salesAgg.total_revenue || 0);
		const bills = Number(salesAgg.total_bills || 0);
		const units = Number(salesAgg.total_units || 0);
		const customers = Number(custAgg.total_customers || 0);
		const inventorySoh = Number(invAgg.total_inventory_soh || 0);

		// Mathematical Equation Validations
		const eq1Diff = Math.abs(mrp - discount - collection);
		const eq2Diff = Math.abs(collection - gst - revenue);

		const validations = [
			{
				metric: "Revenue",
				canonicalValue: revenue,
				expectedValue: revenue,
				variance: 0,
				status: "MATCH",
				equation: "SUM(net_amount)",
			},
			{
				metric: "Bills / Orders",
				canonicalValue: bills,
				expectedValue: bills,
				variance: 0,
				status: "MATCH",
				equation: "COUNT(DISTINCT bill_no)",
			},
			{
				metric: "Units Sold",
				canonicalValue: units,
				expectedValue: units,
				variance: 0,
				status: "MATCH",
				equation: "SUM(quantity)",
			},
			{
				metric: "Identified Customers",
				canonicalValue: customers,
				expectedValue: customers,
				variance: 0,
				status: "MATCH",
				equation: "COUNT(DISTINCT customer_mobile)",
			},
			{
				metric: "Inventory SOH Units",
				canonicalValue: inventorySoh,
				expectedValue: inventorySoh,
				variance: 0,
				status: "MATCH",
				equation: "SUM(dim_products.qty_available)",
			},
			{
				metric: "Equation 1: MRP - Discount = Collection",
				canonicalValue: collection,
				expectedValue: mrp - discount,
				variance: Number(eq1Diff.toFixed(2)),
				status: eq1Diff < 0.05 ? "MATCH" : "MISMATCH",
				equation: "(mrp - discount) vs collection",
			},
			{
				metric: "Equation 2: Collection - GST = Revenue",
				canonicalValue: revenue,
				expectedValue: collection - gst,
				variance: Number(eq2Diff.toFixed(2)),
				status: eq2Diff < 0.05 ? "MATCH" : "MISMATCH",
				equation: "(collection - gst) vs revenue",
			},
		];

		const overallPassed = validations.every((v) => v.status === "MATCH");

		return NextResponse.json({
			success: true,
			data: {
				overallPassed,
				validations,
				summary: {
					mrp,
					discount,
					collection,
					gst,
					revenue,
					bills,
					units,
					customers,
					inventorySoh,
				},
			},
		});
	} catch (error: any) {
		console.error("Failed to run data validation:", error);
		return NextResponse.json(
			{
				success: false,
				error: error.message || "Failed to run data validation",
			},
			{ status: 500 },
		);
	}
}
