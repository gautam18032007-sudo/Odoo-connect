import {
	type OdooCustomer,
	upsertCustomers,
} from "../../repositories/odoo.repository";
import { formatDateTimeForOdoo, type OdooClient } from "../client";

/**
 * Synchronizes Odoo customers (res.partner) incrementally.
 * Handles active and archived customers.
 */
export async function syncCustomers(
	client: OdooClient,
	lastSync: string | null,
): Promise<number> {
	console.log(
		`[syncCustomers] Starting customers sync. Last sync: ${lastSync || "never"}`,
	);

	const fields = [
		"id",
		"name",
		"email",
		"phone",
		"city",
		"customer_rank",
		"active",
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
			`[syncCustomers] Fetching batch (offset: ${offset}, limit: ${limit})...`,
		);
		const records = await client.fetchBatch(
			"res.partner",
			fields,
			domain,
			"write_date asc",
			limit,
			offset,
		);

		if (records.length === 0) {
			hasMore = false;
			break;
		}

		console.log(`[syncCustomers] Processing ${records.length} records...`);
		const customersToUpsert: OdooCustomer[] = records.map((rec: any) => {
			// Prefer the dedicated `mobile` field (correct per Odoo ground-truth field
			// mapping); fall back to `phone` for records where only that was entered.
			const mobileNumber = rec.mobile
				? String(rec.mobile)
				: rec.phone
					? String(rec.phone)
					: undefined;

			return {
				id: Number(rec.id),
				name: String(rec.name),
				email: rec.email ? String(rec.email) : undefined,
				mobile: mobileNumber,
				city: rec.city ? String(rec.city) : undefined,
				customerRank: rec.customer_rank ? Number(rec.customer_rank) : 0,
				active: Boolean(rec.active !== false),
			};
		});

		await upsertCustomers(customersToUpsert);
		totalUpserted += customersToUpsert.length;

		if (records.length < limit) {
			hasMore = false;
		} else {
			offset += limit;
		}
	}

	console.log(
		`[syncCustomers] Completed. Total customers upserted: ${totalUpserted}`,
	);
	return totalUpserted;
}
