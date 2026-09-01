import { sql } from "../db";

/**
 * New file, deliberately separate from odoo.repository.ts (which is under
 * active concurrent edit by another session this engagement — see
 * docs/ODOO_SOURCE_OF_TRUTH_AUDIT.md). Holds upsert functions for the 5
 * Phase 3 canonical dimensions approved in the Phase 2 schema design report.
 * None of these touch dim_stores/dim_products/fact_* rows except the two
 * explicit, additive backfill functions at the bottom.
 */

export interface OdooCompany {
	id: number;
	name: string;
	vat?: string | null;
	stateName?: string | null;
	countryName?: string | null;
	active: boolean;
}

export interface OdooPosConfigDimension {
	id: number;
	name: string;
	companyId: number | null;
	warehouseId: number | null;
	warehouseCode?: string | null;
	pickingTypeId: number | null;
	active: boolean;
}

export interface OdooTaxDimension {
	id: number;
	name: string;
	amount: number;
	amountType: string;
	typeTaxUse: string;
	companyId: number | null;
	active: boolean;
}

export interface OdooLocationDimension {
	id: number;
	name: string;
	completeName?: string | null;
	usage?: string | null;
	companyId: number | null;
	parentLocationId?: number | null;
	warehouseId: number | null;
}

export interface OdooCategoryDimension {
	id: number;
	rawName: string;
	parentCategoryId?: number | null;
}

export async function upsertCompanies(companies: OdooCompany[]): Promise<void> {
	if (companies.length === 0) return;
	for (const c of companies) {
		await sql`
			INSERT INTO dim_companies (id, name, vat, state_name, country_name, active)
			VALUES (${c.id}, ${c.name}, ${c.vat ?? null}, ${c.stateName ?? null}, ${c.countryName ?? null}, ${c.active})
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name,
				vat = EXCLUDED.vat,
				state_name = EXCLUDED.state_name,
				country_name = EXCLUDED.country_name,
				active = EXCLUDED.active,
				updated_at = NOW()
		`;
	}
}

export async function upsertPosConfigs(
	configs: OdooPosConfigDimension[],
): Promise<void> {
	if (configs.length === 0) return;
	for (const c of configs) {
		await sql`
			INSERT INTO dim_pos_configs (id, name, company_id, warehouse_id, warehouse_code, picking_type_id, active)
			VALUES (${c.id}, ${c.name}, ${c.companyId}, ${c.warehouseId}, ${c.warehouseCode ?? null}, ${c.pickingTypeId}, ${c.active})
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name,
				company_id = EXCLUDED.company_id,
				warehouse_id = EXCLUDED.warehouse_id,
				warehouse_code = EXCLUDED.warehouse_code,
				picking_type_id = EXCLUDED.picking_type_id,
				active = EXCLUDED.active,
				updated_at = NOW()
		`;
	}
}

export async function upsertTaxes(taxes: OdooTaxDimension[]): Promise<void> {
	if (taxes.length === 0) return;
	for (const t of taxes) {
		await sql`
			INSERT INTO dim_tax (id, name, amount, amount_type, type_tax_use, company_id, active)
			VALUES (${t.id}, ${t.name}, ${t.amount}, ${t.amountType}, ${t.typeTaxUse}, ${t.companyId}, ${t.active})
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name,
				amount = EXCLUDED.amount,
				amount_type = EXCLUDED.amount_type,
				type_tax_use = EXCLUDED.type_tax_use,
				company_id = EXCLUDED.company_id,
				active = EXCLUDED.active,
				updated_at = NOW()
		`;
	}
}

/**
 * Locations are upserted in two passes by the caller (self-FK on
 * parent_location_id) — pass 1 with parentLocationId omitted/null for every
 * row, pass 2 with it populated once all rows exist. See syncLocations().
 */
export async function upsertLocations(
	locations: OdooLocationDimension[],
): Promise<void> {
	if (locations.length === 0) return;
	for (const l of locations) {
		await sql`
			INSERT INTO dim_locations (id, name, complete_name, usage, company_id, parent_location_id, warehouse_id)
			VALUES (${l.id}, ${l.name}, ${l.completeName ?? null}, ${l.usage ?? null}, ${l.companyId}, ${l.parentLocationId ?? null}, ${l.warehouseId})
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name,
				complete_name = COALESCE(EXCLUDED.complete_name, dim_locations.complete_name),
				usage = COALESCE(EXCLUDED.usage, dim_locations.usage),
				company_id = COALESCE(EXCLUDED.company_id, dim_locations.company_id),
				parent_location_id = COALESCE(EXCLUDED.parent_location_id, dim_locations.parent_location_id),
				warehouse_id = COALESCE(EXCLUDED.warehouse_id, dim_locations.warehouse_id),
				updated_at = NOW()
		`;
	}
}

export async function upsertCategories(
	categories: OdooCategoryDimension[],
): Promise<void> {
	if (categories.length === 0) return;
	for (const c of categories) {
		const normalizedName = c.rawName.trim();
		await sql`
			INSERT INTO dim_product_categories (id, raw_name, normalized_name, parent_category_id)
			VALUES (${c.id}, ${c.rawName}, ${normalizedName}, ${c.parentCategoryId ?? null})
			ON CONFLICT (id) DO UPDATE SET
				raw_name = EXCLUDED.raw_name,
				normalized_name = EXCLUDED.normalized_name,
				parent_category_id = COALESCE(EXCLUDED.parent_category_id, dim_product_categories.parent_category_id),
				updated_at = NOW()
		`;
	}
}

/**
 * Additive backfill only — updates dim_stores.company_id and corrects
 * code/location_id by joining to the now-populated dim_pos_configs +
 * dim_locations tables (Phase 2 §12 step 6). Does not touch
 * syncSales.ts's live sync logic; this is a one-off, idempotent, re-runnable
 * SQL statement, not a code-path change.
 */
export async function backfillStoreSourceFields(): Promise<
	{
		id: number;
		name: string;
		new_code: string | null;
		new_location_id: number | null;
	}[]
> {
	return (await sql`
		UPDATE dim_stores ds
		SET
			company_id = pc.company_id,
			code = CASE WHEN pc.warehouse_code IS NOT NULL THEN pc.warehouse_code ELSE ds.code END,
			location_id = COALESCE(loc.id, ds.location_id)
		FROM dim_pos_configs pc
		LEFT JOIN dim_locations loc ON loc.warehouse_id = pc.warehouse_id AND loc.usage = 'internal'
		WHERE ds.id = pc.id
		RETURNING ds.id, ds.name, ds.code AS new_code, ds.location_id AS new_location_id
	`) as any;
}

export async function backfillProductCategoryIds(): Promise<void> {
	await sql`
		UPDATE dim_products dp
		SET category_id = dc.id
		FROM dim_product_categories dc
		WHERE dp.category IS NOT NULL
			AND dp.category_id IS NULL
			AND dp.category = dc.raw_name
	`;
}

/**
 * Phase 4: sets dim_products.category_id directly from the real Odoo
 * category ID seen on each product (categ_id[0]) — more robust than
 * backfillProductCategoryIds()'s name-matching, and immune to the
 * whitespace-duplicate-category issue since it never compares by name.
 */
export async function upsertProductCategoryLinks(
	links: { productId: number; categoryId: number }[],
): Promise<void> {
	if (links.length === 0) return;
	const productIds = links.map((l) => l.productId);
	const categoryIds = links.map((l) => l.categoryId);
	await sql`
		UPDATE dim_products dp
		SET category_id = v.category_id
		FROM (
			SELECT * FROM UNNEST(${productIds}::int[], ${categoryIds}::int[]) AS t(product_id, category_id)
		) v
		WHERE dp.id = v.product_id
	`;
}

/**
 * Phase 4: returns the set of location IDs currently known to
 * dim_locations, so sync code can validate an incoming Odoo location_id
 * before writing to fact_inventory (which now has a FK on that column —
 * see migrate-odoo-source-dimensions.ts / add-inventory-location-fk.ts)
 * instead of letting an unresolved location fail the whole batch insert.
 */
export async function getKnownLocationIds(): Promise<Set<number>> {
	const rows = await sql`SELECT id FROM dim_locations`;
	return new Set(rows.map((r: any) => Number(r.id)));
}
