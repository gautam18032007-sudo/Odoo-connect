import {
	type OdooProduct,
	upsertProducts,
} from "../../repositories/odoo.repository";
import { formatDateTimeForOdoo, type OdooClient } from "../client";

/**
 * Synchronizes Odoo product variants (product.product) incrementally.
 * Handles active and archived products.
 */
export async function syncProducts(
	client: OdooClient,
	lastSync: string | null,
): Promise<number> {
	console.log(
		`[syncProducts] Starting product variants sync. Last sync: ${lastSync || "never"}`,
	);

	const fields = [
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
		"is_storable",
		"write_date",
	];

	// Build incremental sync domain filter
	const domain: any[] = [["active", "in", [true, false]]];
	if (lastSync) {
		const formattedDate = formatDateTimeForOdoo(lastSync);
		domain.push(["write_date", ">=", formattedDate]);
	}

	let offset = 0;
	const limit = 100;
	let totalUpserted = 0;
	let hasMore = true;

	while (hasMore) {
		console.log(
			`[syncProducts] Fetching batch (offset: ${offset}, limit: ${limit})...`,
		);
		const records = await client.fetchBatch(
			"product.product",
			fields,
			domain,
			"write_date desc",
			limit,
			offset,
		);

		if (records.length === 0) {
			hasMore = false;
			break;
		}

		console.log(`[syncProducts] Processing ${records.length} records...`);
		const productsToUpsert: OdooProduct[] = records.map((rec: any) => ({
			id: Number(rec.id),
			name: String(rec.name),
			defaultCode: rec.default_code ? String(rec.default_code) : undefined,
			barcode: rec.barcode ? String(rec.barcode) : undefined,
			listPrice: rec.list_price ? Number(rec.list_price) : 0,
			costPrice: rec.standard_price ? Number(rec.standard_price) : 0,
			qtyAvailable: rec.qty_available ? Number(rec.qty_available) : 0,
			freeQty: rec.free_qty ? Number(rec.free_qty) : 0,
			active: Boolean(rec.active !== false),
			// categ_id is a Many2one: [id, "Category Name"] or false if unset.
			category: Array.isArray(rec.categ_id)
				? String(rec.categ_id[1])
				: undefined,
			isStorable: Boolean(rec.is_storable),
		}));

		await upsertProducts(productsToUpsert);
		totalUpserted += productsToUpsert.length;

		if (records.length < limit) {
			hasMore = false;
		} else {
			offset += limit;
		}
	}

	console.log(
		`[syncProducts] Completed. Total product variants upserted: ${totalUpserted}`,
	);
	return totalUpserted;
}
