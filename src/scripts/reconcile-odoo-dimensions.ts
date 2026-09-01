import path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Phase 3 reconciliation: compares live Odoo counts to canonical dimension
 * table counts. Read-only. Exact match required — no "close enough".
 */
async function main() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL in environment.");
		process.exit(1);
	}

	const { OdooClient } = await import("../lib/odoo/client");
	const { sql } = await import("../lib/db");
	const odoo = new OdooClient();

	const [odooCompanies, odooPos, odooTax, odooLoc, odooCat] = await Promise.all(
		[
			odoo.callKw<any[]>("res.company", "search_read", [], { fields: ["id"] }),
			odoo.callKw<any[]>("pos.config", "search_read", [], { fields: ["id"] }),
			odoo.callKw<any[]>("account.tax", "search_read", [], { fields: ["id"] }),
			odoo.callKw<any[]>("stock.location", "search_read", [], {
				fields: ["id"],
			}),
			odoo.callKw<any[]>("product.category", "search_read", [], {
				fields: ["id"],
			}),
		],
	);

	const [dbCompanies, dbPos, dbTax, dbLoc, dbCat] = await Promise.all([
		sql`SELECT COUNT(*) FROM dim_companies`,
		sql`SELECT COUNT(*) FROM dim_pos_configs`,
		sql`SELECT COUNT(*) FROM dim_tax`,
		sql`SELECT COUNT(*) FROM dim_locations`,
		sql`SELECT COUNT(*) FROM dim_product_categories`,
	]);

	const rows = [
		["companies", odooCompanies.length, Number(dbCompanies[0].count)],
		["pos_configs", odooPos.length, Number(dbPos[0].count)],
		["tax", odooTax.length, Number(dbTax[0].count)],
		["locations", odooLoc.length, Number(dbLoc[0].count)],
		["categories", odooCat.length, Number(dbCat[0].count)],
	];

	console.log("dimension       odoo_count  db_count  match");
	let allMatch = true;
	for (const [name, odooCount, dbCount] of rows) {
		const match = odooCount === dbCount;
		if (!match) allMatch = false;
		console.log(
			`${String(name).padEnd(15)} ${String(odooCount).padEnd(11)} ${String(dbCount).padEnd(9)} ${match ? "✅" : "❌"}`,
		);
	}

	console.log(
		allMatch ? "\n✅ RECONCILIATION PASS" : "\n❌ RECONCILIATION FAIL",
	);
	if (!allMatch) process.exit(1);
}

main().catch((err) => {
	console.error("❌ Reconciliation failed:", err.message || err);
	process.exit(1);
});
