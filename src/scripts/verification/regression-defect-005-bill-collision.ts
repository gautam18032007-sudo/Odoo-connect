/**
 * Regression check for DEFECT-005 (bill_no is not a safe transaction
 * identity; order_id is). Not integrated into an npm test command — see
 * regression-defect-004-refund-sign.ts for why. Run directly:
 *   npx tsx src/scripts/regression-defect-005-bill-collision.ts
 *
 * Simulates a small sales_fact_v-shaped fixture reproducing the exact
 * pattern proven live in production: two distinct real orders sharing one
 * bill_no (Odoo's per-session order numbering reset), each with multiple
 * lines, and confirms COUNT(DISTINCT bill_no) undercounts while
 * COUNT(DISTINCT order_id) does not — and that multi-line orders don't
 * inflate the count either way.
 */

export {};

interface FixtureRow {
	orderId: string;
	billNo: string;
}

// order A: 2 lines, order B: 3 lines, SAME bill_no ("ZenZebra - 000018"),
// matching the real collision pattern found in production.
const fixture: FixtureRow[] = [
	{ orderId: "pos_408", billNo: "ZenZebra - 000018" },
	{ orderId: "pos_408", billNo: "ZenZebra - 000018" },
	{ orderId: "pos_4545", billNo: "ZenZebra - 000018" },
	{ orderId: "pos_4545", billNo: "ZenZebra - 000018" },
	{ orderId: "pos_4545", billNo: "ZenZebra - 000018" },
	// a genuinely non-colliding order, single line
	{ orderId: "pos_9999", billNo: "KLJ - 000001" },
];

function countDistinct<T>(rows: T[], key: (r: T) => string): number {
	return new Set(rows.map(key)).size;
}

let failures = 0;
function assertEqual(label: string, actual: number, expected: number) {
	if (actual !== expected) {
		console.error(`FAIL: ${label} — expected ${expected}, got ${actual}`);
		failures++;
	} else {
		console.log(`PASS: ${label}`);
	}
}

const byBillNo = countDistinct(fixture, (r) => r.billNo);
const byOrderId = countDistinct(fixture, (r) => r.orderId);

// The buggy formula: 2 distinct real orders collapse into 1 bill_no.
assertEqual(
	"COUNT(DISTINCT bill_no) undercounts (proves the bug exists)",
	byBillNo,
	2,
);

// The fixed formula: 3 real distinct transactions (2 colliding + 1 clean).
assertEqual(
	"COUNT(DISTINCT order_id) returns the correct transaction count",
	byOrderId,
	3,
);

// Multi-line orders must not inflate the count: order pos_4545 has 3 rows/lines
// but must still count as exactly 1 transaction.
const rowsForOrder4545 = fixture.filter((r) => r.orderId === "pos_4545").length;
assertEqual(
	"order with 3 lines has 3 raw rows (fixture sanity)",
	rowsForOrder4545,
	3,
);
assertEqual(
	"but COUNT(DISTINCT order_id) still counts it as exactly 1 transaction, not 3",
	countDistinct(
		fixture.filter((r) => r.orderId === "pos_4545"),
		(r) => r.orderId,
	),
	1,
);

if (failures > 0) {
	console.error(`\n${failures} assertion(s) failed.`);
	process.exit(1);
}
console.log("\nAll DEFECT-005 regression assertions passed.");
