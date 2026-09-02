/**
 * Regression check for DEFECT-004 (refund line sign correction).
 * Not integrated into an npm test command — this repo has no test
 * framework (no jest/vitest/mocha installed, no test files anywhere,
 * confirmed by search before writing this). Run directly:
 *   npx tsx src/scripts/regression-defect-004-refund-sign.ts
 * Exits non-zero on any assertion failure.
 *
 * Imports the ACTUAL production sign-derivation function from
 * syncSales.ts (extracted there as `deriveSignedLineAmounts`, a pure
 * function with no DB/Odoo access) — this test exercises the real
 * production code path, not a reimplementation of it.
 */

import { deriveSignedLineAmounts } from "../lib/odoo/sync/syncSales";

let failures = 0;
function assertEqual(label: string, actual: number, expected: number) {
	if (Math.abs(actual - expected) > 1e-9) {
		console.error(`FAIL: ${label} — expected ${expected}, got ${actual}`);
		failures++;
	} else {
		console.log(`PASS: ${label}`);
	}
}

// 1. Normal sale: positive qty, Odoo returns correctly-signed positive values.
{
	const r = deriveSignedLineAmounts(100, 105, 2);
	assertEqual("normal sale: subtotal stays positive", r.priceSubtotal, 100);
	assertEqual("normal sale: tax stays positive", r.taxAmount, 5);
}

// 2. Refund with Odoo returning WRONGLY-POSITIVE raw values (the confirmed,
//    live-observed bug case: e.g. pos_3481 "KLJ - 000046 REFUND",
//    qty=-1, price_subtotal=42.86, price_subtotal_incl=45).
{
	const r = deriveSignedLineAmounts(42.86, 45, -1);
	assertEqual(
		"refund, source mis-signed: subtotal forced negative",
		r.priceSubtotal,
		-42.86,
	);
	assertEqual(
		"refund, source mis-signed: tax forced negative",
		r.taxAmount,
		-2.14,
	);
}

// 3. Refund where Odoo already returns correctly-signed negative values — must
//    NOT be double-inverted.
{
	const r = deriveSignedLineAmounts(-50, -52.5, -1);
	assertEqual(
		"refund, already correctly signed: subtotal stays negative (no double-invert)",
		r.priceSubtotal,
		-50,
	);
	assertEqual(
		"refund, already correctly signed: tax stays negative (no double-invert)",
		r.taxAmount,
		-2.5,
	);
}

// 4. Mixed-sign lines within the SAME order — live-observed (pos_1587,
//    "SWN - 000485 REFUND"): one line already correctly negative
//    (-50.84), another wrongly positive (110), both qty=-1. Each line's
//    sign must be derived independently from its own qty — order-level
//    state must never leak between lines.
{
	const alreadyNegativeLine = deriveSignedLineAmounts(-50.84, -60, -1);
	const wronglyPositiveLine = deriveSignedLineAmounts(110, 110, -1);
	assertEqual(
		"mixed-sign order, line already negative: stays negative, unaffected by sibling line",
		alreadyNegativeLine.priceSubtotal,
		-50.84,
	);
	assertEqual(
		"mixed-sign order, sibling line wrongly positive: independently corrected to negative",
		wronglyPositiveLine.priceSubtotal,
		-110,
	);
}

// 5. Zero quantity edge case: sign defaults to positive (qty < 0 is false for 0),
//    subtotal is 0 either way so the sign choice is moot but must not throw/NaN.
{
	const r = deriveSignedLineAmounts(0, 0, 0);
	assertEqual("zero qty: subtotal is zero", r.priceSubtotal, 0);
	assertEqual("zero qty: tax is zero", r.taxAmount, 0);
}

// 6. Zero-value refund line (qty negative, amount genuinely zero) — sign must
//    still resolve to negative-capable (i.e. not silently forced positive).
{
	const r = deriveSignedLineAmounts(0, 0, -3);
	assertEqual(
		"zero-amount refund line: subtotal is zero (sign moot, no crash)",
		r.priceSubtotal,
		-0,
	);
}

if (failures > 0) {
	console.error(`\n${failures} assertion(s) failed.`);
	process.exit(1);
}
console.log(
	"\nAll DEFECT-004 regression assertions passed (testing production syncSales.ts code).",
);
