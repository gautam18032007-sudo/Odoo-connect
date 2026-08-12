import { createHash } from "node:crypto";

/**
 * Customer Identity Layer.
 *
 * Customer identity priority:
 *   1. Odoo Customer ID → strongest identity (ID_<id>)
 *   2. Normalized mobile → valid identity (MOBILE_<last10digits>)
 *   3. Normalized email → valid identity (EMAIL_<lowercased_email>)
 *   4. Customer name → fallback identification ONLY (NAME_<md5_hash>), NOT automatic cross-customer merge
 *   5. Anonymous fallback → ANON_<bill_no>
 */

export const ID_PRESENT_SQL = `(customer_id IS NOT NULL AND customer_id::text <> '')`;
export const MOBILE_PRESENT_SQL = `regexp_replace(COALESCE(customer_mobile, ''), '\\D', '', 'g') <> ''`;
export const EMAIL_PRESENT_SQL = `btrim(COALESCE(customer_email, '')) <> ''`;
export const NAME_PRESENT_SQL = `btrim(COALESCE(customer_name, '')) <> ''`;

/** Normalized mobile expression: last 10 digits when length >= 10. */
const MOBILE_DIGITS_SQL = `RIGHT(regexp_replace(customer_mobile, '\\D', '', 'g'), 10)`;

/** md5 of the normalized (collapsed-whitespace, trimmed, lowercased) name. */
const NAME_HASH_SQL = `md5(lower(btrim(regexp_replace(customer_name, '\\s+', ' ', 'g'))))`;

/**
 * SQL expression producing the customer identity key for a `sales_fact_v` row.
 * Priority: Odoo customer ID -> Mobile -> Email -> Name -> Anonymous per bill.
 */
export const CUSTOMER_IDENTITY_KEY_SQL = `
  CASE
    WHEN ${ID_PRESENT_SQL}     THEN 'ID_' || customer_id::text
    WHEN ${MOBILE_PRESENT_SQL} THEN 'MOBILE_' || ${MOBILE_DIGITS_SQL}
    WHEN ${EMAIL_PRESENT_SQL}  THEN 'EMAIL_' || lower(btrim(customer_email))
    WHEN ${NAME_PRESENT_SQL}   THEN 'NAME_' || ${NAME_HASH_SQL}
    ELSE 'ANON_' || bill_no
  END`;

/**
 * SQL predicate: the customer is *identified* (has an Odoo ID, mobile, email, or name).
 */
export const IS_IDENTIFIED_SQL = `(${ID_PRESENT_SQL} OR ${MOBILE_PRESENT_SQL} OR ${EMAIL_PRESENT_SQL} OR ${NAME_PRESENT_SQL})`;

/** TS mirror: collapse internal whitespace, trim, lowercase. */
export function normalizeName(name: string | null | undefined): string {
	return (name ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** TS mirror: strip every non-digit character from a mobile number; take last 10 digits. */
export function normalizeMobile(mobile: string | null | undefined): string {
	const digits = (mobile ?? "").replace(/\D/g, "");
	return digits.length >= 10 ? digits.slice(-10) : digits;
}

/** TS mirror: trim and lowercase email. */
export function normalizeEmail(email: string | null | undefined): string {
	return (email ?? "").trim().toLowerCase();
}

export interface IdentityInput {
	billNo: string;
	customerId?: number | string | null;
	customerMobile?: string | null;
	customerEmail?: string | null;
	customerName?: string | null;
}

export function resolveIdentityKey(row: IdentityInput): string {
	if (
		row.customerId !== undefined &&
		row.customerId !== null &&
		String(row.customerId).trim() !== ""
	) {
		return `ID_${row.customerId}`;
	}
	const mobile = normalizeMobile(row.customerMobile);
	if (mobile) return `MOBILE_${mobile}`;

	const email = normalizeEmail(row.customerEmail);
	if (email) return `EMAIL_${email}`;

	const name = normalizeName(row.customerName);
	if (name) return `NAME_${createHash("md5").update(name).digest("hex")}`;

	return `ANON_${row.billNo}`;
}

export function isIdentified(row: IdentityInput): boolean {
	return (
		(row.customerId !== undefined &&
			row.customerId !== null &&
			String(row.customerId).trim() !== "") ||
		normalizeMobile(row.customerMobile) !== "" ||
		normalizeEmail(row.customerEmail) !== "" ||
		normalizeName(row.customerName) !== ""
	);
}
