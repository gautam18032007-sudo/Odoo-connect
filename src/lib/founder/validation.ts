import * as xlsx from "xlsx";

import type {
	CanonicalSalesRow,
	LegacyValidationResult,
	UploadRowError,
} from "./types";

const _REQUIRED_FIELDS = [
	"sale_date",
	"bill_no",
	"billed_by",
	"store",
	"category",
	"brand",
	"sku",
	"product_name",
	"quantity",
	"net_amount",
] as const;

const HEADER_ALIASES: Record<string, string> = {
	// Bill/Order fields
	number: "bill_no",
	bill_number: "bill_no",
	bill_no: "bill_no",
	bill: "bill_no",
	invoice: "bill_no",
	invoice_no: "bill_no",
	invoice_number: "bill_no",
	receipt: "bill_no",
	order_id: "bill_no",
	ordernumber: "bill_no",

	// Store/Channel fields - ✅ PRIMARY DIFFERENTIATOR
	billed_by: "billed_by",
	billedby: "billed_by",
	billed: "billed_by",
	channel: "billed_by",
	store: "store",
	location: "store",
	branch: "store",
	company: "store",
	businessname: "store",

	// Date/Time fields
	date: "sale_date",
	order_date: "sale_date",
	sales_date: "sale_date",
	salesdate: "sale_date",
	dateonly: "sale_date",
	date_only: "sale_date",
	time: "sale_time",
	ordertime: "sale_time",
	transaction_time: "sale_time",

	// Product fields
	item: "product_name",
	item_name: "product_name",
	product: "product_name",
	product_name: "product_name",
	description: "product_name",
	item_description: "product_name",
	sku: "sku",
	category: "category",
	category_name: "category",
	brand: "brand",

	// Quantity/Amount fields
	qty: "quantity",
	quantity: "quantity",
	amount: "net_amount",
	bill_amount: "net_amount",
	order_amount: "net_amount",
	orderamount: "net_amount",
	net_amount: "net_amount",
	net_sales: "net_amount",
	total: "total_amount",
	totalamount: "total_amount",
	total_amount: "total_amount",
	grand_total: "total_amount",
	value: "net_amount",
	saleprice: "net_amount",
	sale_price: "net_amount",
	currentsaleprice: "net_amount",
	current_sale_price: "net_amount",

	// Tax fields - ✅ NEW
	sgst: "sgst",
	cgst: "cgst",
	igst: "igst",
	tax: "igst",
	taxamount: "igst",
	tax_amount: "igst",

	// Payment fields - ✅ NEW
	paymentmethod: "payment_method",
	payment_method: "payment_method",
	payment: "payment_method",
	pm_cod: "payment_method",
	pm_upi: "payment_method",
	pm_card: "payment_method",

	// Customer fields - ✅ NEW
	customer_id: "customer_id",
	customerid: "customer_id",
	customer_name: "customer_name",
	customername: "customer_name",
	customer_mobile: "customer_id",
	customermobile: "customer_id",
	mobile: "customer_id",
	email: "customer_id",
};

function normalizeHeader(header: string) {
	const normalized = header
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");

	return HEADER_ALIASES[normalized] ?? normalized;
}

function normalizeRow(row: Record<string, unknown>) {
	return Object.entries(row).reduce<Record<string, unknown>>(
		(acc, [key, value]) => {
			acc[normalizeHeader(key)] = value;
			return acc;
		},
		{},
	);
}

function toRequiredText(value: unknown) {
	return String(value ?? "").trim();
}

function parseMoney(value: unknown) {
	if (typeof value === "number") return value;
	const cleaned = String(value ?? "")
		.replace(/,/g, "")
		.replace(/[^\d.-]/g, "")
		.trim();
	return Number(cleaned);
}

/**
 * Parse time in HH:MM:SS format (or HH:MM, or with AM/PM)
 * Examples: "20:30:29", "14:30", "2:30 PM"
 * Returns null if time cannot be parsed
 */
function parseTime(value: unknown): string | null {
	const text = String(value ?? "").trim();
	if (!text) return null;

	// Match HH:MM:SS or HH:MM with optional AM/PM
	const timeMatch = text.match(
		/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:(AM|PM|am|pm))?/,
	);
	if (!timeMatch) return null;

	const [, hoursStr, minutesStr, secondsStr, meridiem] = timeMatch;
	let hours = Number(hoursStr);
	const minutes = Number(minutesStr);
	const seconds = Number(secondsStr || "0");

	// Handle AM/PM
	if (meridiem) {
		const isPm = meridiem.toUpperCase() === "PM";
		if (isPm && hours !== 12) hours += 12;
		if (!isPm && hours === 12) hours = 0;
	}

	// Validate
	if (
		hours < 0 ||
		hours > 23 ||
		minutes < 0 ||
		minutes > 59 ||
		seconds < 0 ||
		seconds > 59
	) {
		return null;
	}

	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Enhanced date parser that handles multiple formats without defaulting to today
 * Supports:
 * - Excel numeric date codes (42000)
 * - YYYY/MM/DD (2026/06/15) with optional time ✅ YOUR FORMAT
 * - YYYY-MM-DD (2026-06-15) with optional time (ISO)
 * - DD/MM/YYYY (15/06/2026)
 * - DD-MM-YYYY (15-06-2026) with optional time ✅ YOUR FORMAT
 * - MM/DD/YYYY (06/15/2026)
 * - MM-DD-YYYY (06-15-2026)
 * - With or without time component (HH:MM:SS)
 */
function parseSaleDate(value: unknown): string | null {
	// Format 1: Excel numeric date code
	if (typeof value === "number") {
		const parsed = xlsx.SSF.parse_date_code(value);
		if (!parsed) {
			console.warn(`⚠️ Excel date code ${value} could not be parsed`);
			return null;
		}
		return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d))
			.toISOString()
			.slice(0, 10);
	}

	// Format 2: JavaScript Date object
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value.toISOString().slice(0, 10);
	}

	const text = String(value ?? "").trim();
	if (!text) return null;

	// ✅ Step 1: Extract and preserve time component (but don't remove from date string yet)
	// This allows us to validate the full string
	const dateWithoutTime = text
		.replace(/\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM|am|pm))?\s*$/, "")
		.trim();

	if (!dateWithoutTime) return null; // If only time was provided, invalid

	// ✅ Format 3a: YYYY/MM/DD (2026/06/15) - YOUR FORMAT!
	const yyyySlashMatch = dateWithoutTime.match(
		/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
	);
	if (yyyySlashMatch) {
		const [, year, month, day] = yyyySlashMatch;
		const date = new Date(
			Date.UTC(Number(year), Number(month) - 1, Number(day)),
		);
		if (!Number.isNaN(date.getTime())) {
			return date.toISOString().slice(0, 10);
		}
	}

	// ✅ Format 3b: YYYY-MM-DD (2026-06-15) - ISO format
	const yyyyDashMatch = dateWithoutTime.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
	if (yyyyDashMatch) {
		const [, year, month, day] = yyyyDashMatch;
		const date = new Date(
			Date.UTC(Number(year), Number(month) - 1, Number(day)),
		);
		if (!Number.isNaN(date.getTime())) {
			return date.toISOString().slice(0, 10);
		}
	}

	// ✅ Format 4: DD-MM-YYYY (15-06-2026) or DD/MM/YYYY (15/06/2026) - YOUR FORMAT!
	// Smart ambiguity detection for (day/month/year) vs (month/day/year)
	const ddDashMatch = dateWithoutTime.match(
		/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/,
	);
	if (ddDashMatch) {
		const [, dayOrMonth, monthOrDay, year] = ddDashMatch;
		const day = Number(dayOrMonth);
		const month = Number(monthOrDay);

		// If day > 12, it MUST be DD-MM format (day can't be > 12 in MM-DD)
		if (day > 12) {
			const date = new Date(Date.UTC(Number(year), month - 1, day));
			if (!Number.isNaN(date.getTime())) {
				return date.toISOString().slice(0, 10);
			}
		}
		// If month > 12, it MUST be MM-DD format (month can't be > 12)
		else if (month > 12) {
			const date = new Date(Date.UTC(Number(year), day - 1, month));
			if (!Number.isNaN(date.getTime())) {
				return date.toISOString().slice(0, 10);
			}
		}
		// Both ≤ 12, ambiguous - prefer DD-MM (European format, matches YOUR data!)
		else {
			const date = new Date(Date.UTC(Number(year), month - 1, day));
			if (!Number.isNaN(date.getTime())) {
				return date.toISOString().slice(0, 10);
			}
		}
	}

	// ✅ Format 5: Try generic Date.parse() as last resort
	const genericDate = new Date(dateWithoutTime);
	if (!Number.isNaN(genericDate.getTime())) {
		return genericDate.toISOString().slice(0, 10);
	}

	// ❌ Return null for unparseable dates (will be quarantined)
	console.warn(`⚠️ Could not parse date: "${value}"`);
	return null;
}

export function validateCanonicalSheet(
	rows: Record<string, unknown>[],
): LegacyValidationResult {
	const errors: UploadRowError[] = [];
	const validData: CanonicalSalesRow[] = [];

	if (!rows.length) {
		return {
			isValid: false,
			totalRows: 0,
			validRows: 0,
			errorCount: 1,
			errors: [{ rowNumber: 0, errors: ["Sheet is empty."] }],
			validData,
			dateRange: { start: null, end: null },
			parsedData: validData,
		};
	}

	const normalizedRows = rows.map(normalizeRow);

	for (let i = 0; i < normalizedRows.length; i++) {
		const row = normalizedRows[i];
		const rowNumber = i + 2;
		const rowErrors: string[] = [];

		// ✅ CRITICAL: billed_by is PRIMARY store differentiator
		const billedBy = toRequiredText(row.billed_by);
		if (!billedBy) {
			rowErrors.push(
				"billed_by is required - needed to differentiate between stores",
			);
		}

		// Map billed_by or store to store name (strictly KLJ or Smart_Works_Noida)
		let storeName = "KLJ";
		const rawStore = toRequiredText(row.store);
		const lowerRawStore = rawStore.toLowerCase();
		const lowerBilledBy = billedBy.toLowerCase();

		if (lowerRawStore.includes("smart") || lowerRawStore.includes("noida")) {
			storeName = "Smart_Works_Noida";
		} else if (lowerRawStore.includes("klj")) {
			storeName = "KLJ";
		} else if (
			lowerBilledBy.includes("smart") ||
			lowerBilledBy.includes("noida")
		) {
			storeName = "Smart_Works_Noida";
		} else if (lowerBilledBy.includes("klj")) {
			storeName = "KLJ";
		} else {
			storeName = "KLJ"; // Default fallback
		}

		// Other fields
		const billNo = toRequiredText(row.bill_no) || "Unknown Bill";
		const categoryName = toRequiredText(row.category) || "Uncategorized";
		const brandName = toRequiredText(row.brand) || "Unknown Brand";
		const skuCode = toRequiredText(row.sku) || "Unknown SKU";
		const productName = toRequiredText(row.product_name) || "Unknown Product";

		// ✅ CRITICAL: Validate date - don't default to today
		const saleDate = parseSaleDate(row.sale_date);
		if (!saleDate) {
			rowErrors.push(
				`Invalid sale_date: "${row.sale_date}". Expected formats: YYYY/MM/DD (2026/06/15), DD-MM-YYYY (15-06-2026)`,
			);
		}

		// ✅ NEW: Parse time (preserve it!)
		let saleTime: string | null = null;
		if (row.sale_time) {
			saleTime = parseTime(row.sale_time);
			if (!saleTime && row.sale_time) {
				console.warn(
					`⚠️ Row ${rowNumber}: Could not parse time: "${row.sale_time}"`,
				);
			}
		}

		// Quantity
		let quantity = Number(row.quantity);
		if (!Number.isInteger(quantity) || quantity <= 0) {
			if (Number.isNaN(quantity)) {
				rowErrors.push(
					`Invalid quantity: "${row.quantity}". Expected a number > 0`,
				);
			}
			quantity = 1;
		}

		// Net Amount (main amount)
		let netAmount = parseMoney(row.net_amount);
		if (!Number.isFinite(netAmount) || netAmount < 0) {
			if (!Number.isFinite(netAmount)) {
				rowErrors.push(
					`Invalid net_amount: "${row.net_amount}". Expected a number`,
				);
			}
			netAmount = 0;
		}

		// ✅ NEW: Total Amount (with taxes)
		let totalAmount = parseMoney(row.total_amount);
		if (!Number.isFinite(totalAmount) || totalAmount < 0) {
			totalAmount = netAmount; // Fallback to net_amount if total not provided
		}

		// ✅ NEW: Tax breakdown
		const sgst = parseMoney(row.sgst) || null;
		const cgst = parseMoney(row.cgst) || null;
		const igst = parseMoney(row.igst) || null;

		// ✅ NEW: Payment method
		const paymentMethod = toRequiredText(row.payment_method) || null;

		// ✅ NEW: Customer name
		const customerName = toRequiredText(row.customer_name) || null;

		// Customer ID (can be mobile, email, or ID)
		const customerId = toRequiredText(row.customer_id) || null;

		// ✅ Only add to validData if date is valid
		if (saleDate && billedBy) {
			validData.push({
				sale_date: saleDate,
				sale_time: saleTime,
				bill_no: billNo,
				billed_by: storeName,
				store: rawStore,
				category: categoryName,
				brand: brandName,
				sku: skuCode,
				product_name: productName,
				quantity,
				net_amount: netAmount,
				total_amount: totalAmount,
				payment_method: paymentMethod,
				sgst: sgst,
				cgst: cgst,
				igst: igst,
				customer_id: customerId,
				customer_name: customerName,
				row_number: rowNumber,
			});
		} else {
			// Quarantine row with error
			errors.push({ rowNumber, errors: rowErrors });
		}
	}

	// Deduplicate rows with the exact same (sale_date, bill_no, store, sku) key within the sheet
	const dedupedMap = new Map<string, CanonicalSalesRow>();
	for (const row of validData) {
		const key = `${row.sale_date}|${row.bill_no}|${row.billed_by}|${row.sku}`;
		const existing = dedupedMap.get(key);
		if (existing) {
			existing.quantity += row.quantity;
			existing.net_amount += row.net_amount;
			existing.total_amount += row.total_amount;
			existing.sgst = (existing.sgst || 0) + (row.sgst || 0);
			existing.cgst = (existing.cgst || 0) + (row.cgst || 0);
			existing.igst = (existing.igst || 0) + (row.igst || 0);
			existing.category = row.category;
			existing.brand = row.brand;
			existing.product_name = row.product_name;
			if (row.customer_id) {
				existing.customer_id = row.customer_id;
			}
			if (row.customer_name) {
				existing.customer_name = row.customer_name;
			}
			if (row.payment_method) {
				existing.payment_method = row.payment_method;
			}
			if (row.sale_time) {
				existing.sale_time = row.sale_time;
			}
			existing.row_number = row.row_number; // Keep the last row number
		} else {
			dedupedMap.set(key, { ...row });
		}
	}
	const dedupedData = Array.from(dedupedMap.values());

	const dates = dedupedData.map((row) => row.sale_date).sort();

	return {
		isValid: dedupedData.length > 0,
		totalRows: rows.length,
		validRows: dedupedData.length,
		errorCount: errors.length,
		errors,
		validData: dedupedData,
		dateRange: {
			start: dates[0] ?? null,
			end: dates.at(-1) ?? null,
		},
		parsedData: dedupedData,
	};
}
