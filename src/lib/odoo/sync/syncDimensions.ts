import {
	type OdooCategoryDimension,
	type OdooCompany,
	type OdooLocationDimension,
	type OdooPosConfigDimension,
	type OdooTaxDimension,
	upsertCategories,
	upsertCompanies,
	upsertLocations,
	upsertPosConfigs,
	upsertTaxes,
} from "../../repositories/odoo-dimensions.repository";
import type { OdooClient } from "../client";

/**
 * Phase 3 dimension sync — new, additive sync functions for the 5 canonical
 * dimensions approved in docs/ODOO_SOURCE_OF_TRUTH_AUDIT.md's Phase 2 report.
 *
 * Deliberately NOT wired into worker.ts's continuous poll loop yet, and
 * deliberately does not touch syncSales.ts's existing dim_stores upsert —
 * per the Phase 3 approval: "no production sync behavior changes until the
 * dimensions themselves are validated." Run via
 * src/scripts/sync-odoo-dimensions.ts as a one-off, re-runnable (idempotent)
 * operation until that validation is complete.
 */

export async function syncCompanies(client: OdooClient): Promise<number> {
	const records = await client.callKw<any[]>("res.company", "search_read", [], {
		fields: ["id", "name", "vat", "state_id", "country_id", "active"],
	});
	const companies: OdooCompany[] = records.map((rec) => ({
		id: Number(rec.id),
		name: String(rec.name),
		vat: rec.vat || null,
		stateName: Array.isArray(rec.state_id) ? String(rec.state_id[1]) : null,
		countryName: Array.isArray(rec.country_id)
			? String(rec.country_id[1])
			: null,
		active: rec.active !== false,
	}));
	await upsertCompanies(companies);
	return companies.length;
}

export async function syncPosConfigDimension(
	client: OdooClient,
): Promise<number> {
	const configs = await client.callKw<any[]>("pos.config", "search_read", [], {
		fields: [
			"id",
			"name",
			"company_id",
			"warehouse_id",
			"picking_type_id",
			"active",
		],
	});

	const warehouseIds = [
		...new Set(
			configs
				.map((c) =>
					Array.isArray(c.warehouse_id) ? Number(c.warehouse_id[0]) : null,
				)
				.filter((id): id is number => id !== null),
		),
	];

	const warehouseCodeById = new Map<number, string>();
	if (warehouseIds.length > 0) {
		const warehouses = await client.callKw<any[]>(
			"stock.warehouse",
			"search_read",
			[],
			{
				domain: [["id", "in", warehouseIds]],
				fields: ["id", "code"],
			},
		);
		for (const wh of warehouses) {
			if (wh.code) warehouseCodeById.set(Number(wh.id), String(wh.code));
		}
	}

	const dimensions: OdooPosConfigDimension[] = configs.map((c) => {
		const warehouseId = Array.isArray(c.warehouse_id)
			? Number(c.warehouse_id[0])
			: null;
		return {
			id: Number(c.id),
			name: String(c.name),
			companyId: Array.isArray(c.company_id) ? Number(c.company_id[0]) : null,
			warehouseId,
			warehouseCode: warehouseId
				? (warehouseCodeById.get(warehouseId) ?? null)
				: null,
			pickingTypeId: Array.isArray(c.picking_type_id)
				? Number(c.picking_type_id[0])
				: null,
			active: c.active !== false,
		};
	});
	await upsertPosConfigs(dimensions);
	return dimensions.length;
}

export async function syncTaxDimension(client: OdooClient): Promise<number> {
	const records = await client.callKw<any[]>("account.tax", "search_read", [], {
		fields: [
			"id",
			"name",
			"amount",
			"amount_type",
			"type_tax_use",
			"company_id",
			"active",
		],
	});
	const taxes: OdooTaxDimension[] = records.map((rec) => ({
		id: Number(rec.id),
		name: String(rec.name),
		amount: Number(rec.amount || 0),
		amountType: String(rec.amount_type),
		typeTaxUse: String(rec.type_tax_use),
		companyId: Array.isArray(rec.company_id) ? Number(rec.company_id[0]) : null,
		active: rec.active !== false,
	}));
	await upsertTaxes(taxes);
	return taxes.length;
}

/**
 * Syncs ALL stock.location rows regardless of usage type — deliberately
 * unfiltered. An earlier version of this function restricted to
 * usage='internal' (matching syncInventory.ts's stock.quant domain), but
 * Phase 3 validation (validate-inventory-locations.ts) found a real
 * fact_inventory row at Odoo's standard virtual "Inventory adjustment"
 * location (id 11, usage='inventory', no warehouse_id) — a legitimate
 * system location, not a data-quality issue, that the 'internal'-only
 * filter silently excluded. Syncing unfiltered means any location type
 * Odoo ever produces (view, transit, virtual, internal, or a brand-new one)
 * lands here with warehouse_id = NULL when it isn't part of a real store's
 * warehouse — explicit non-attribution instead of a silent gap, and no
 * future code change needed when a new virtual/location type appears.
 */
export async function syncLocationDimension(
	client: OdooClient,
): Promise<number> {
	const records = await client.callKw<any[]>(
		"stock.location",
		"search_read",
		[],
		{
			fields: [
				"id",
				"name",
				"complete_name",
				"usage",
				"company_id",
				"location_id",
				"warehouse_id",
			],
		},
	);

	// Pass 1: upsert every row without parent_location_id, so all IDs exist
	// before pass 2 tries to set the self-referencing FK.
	const baseLocations: OdooLocationDimension[] = records.map((rec) => ({
		id: Number(rec.id),
		name: String(rec.name),
		completeName: rec.complete_name ? String(rec.complete_name) : null,
		usage: rec.usage ? String(rec.usage) : null,
		companyId: Array.isArray(rec.company_id) ? Number(rec.company_id[0]) : null,
		warehouseId: Array.isArray(rec.warehouse_id)
			? Number(rec.warehouse_id[0])
			: null,
		parentLocationId: null,
	}));
	await upsertLocations(baseLocations);

	// Pass 2: fill parent_location_id only where the parent is itself one of
	// the internal locations just synced (Odoo's location_id may point to a
	// non-internal/view location outside this domain, which we don't sync
	// here — parent stays NULL in that case rather than a dangling FK).
	const syncedIds = new Set(baseLocations.map((l) => l.id));
	const withParents: OdooLocationDimension[] = records
		.map((rec): OdooLocationDimension | null => {
			const parentId = Array.isArray(rec.location_id)
				? Number(rec.location_id[0])
				: null;
			return parentId !== null && syncedIds.has(parentId)
				? {
						id: Number(rec.id),
						name: String(rec.name),
						parentLocationId: parentId,
						companyId: Array.isArray(rec.company_id)
							? Number(rec.company_id[0])
							: null,
						warehouseId: Array.isArray(rec.warehouse_id)
							? Number(rec.warehouse_id[0])
							: null,
					}
				: null;
		})
		.filter((l): l is OdooLocationDimension => l !== null);
	if (withParents.length > 0) await upsertLocations(withParents);

	return baseLocations.length;
}

export async function syncCategoryDimension(
	client: OdooClient,
): Promise<number> {
	const records = await client.callKw<any[]>(
		"product.category",
		"search_read",
		[],
		{
			fields: ["id", "name", "parent_id"],
		},
	);
	const categories: OdooCategoryDimension[] = records.map((rec) => ({
		id: Number(rec.id),
		rawName: String(rec.name),
		parentCategoryId: Array.isArray(rec.parent_id)
			? Number(rec.parent_id[0])
			: null,
	}));
	await upsertCategories(categories);
	return categories.length;
}

export async function syncAllDimensions(client: OdooClient) {
	const companies = await syncCompanies(client);
	const posConfigs = await syncPosConfigDimension(client);
	const taxes = await syncTaxDimension(client);
	const locations = await syncLocationDimension(client);
	const categories = await syncCategoryDimension(client);
	return { companies, posConfigs, taxes, locations, categories };
}
