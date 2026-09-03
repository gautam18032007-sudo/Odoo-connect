import { describe, expect, it } from "vitest";
import { deriveSignedLineAmounts } from "./syncSales";

describe("deriveSignedLineAmounts (refund sign correctness)", () => {
	it("keeps a normal sale line positive", () => {
		const r = deriveSignedLineAmounts(100, 118, 2);
		expect(r.priceSubtotal).toBe(100);
		expect(r.taxAmount).toBe(18);
	});

	it("forces a refund line (negative qty) negative even when Odoo's raw fields come back positive", () => {
		// This is the exact production anomaly the comment above the real
		// function documents: Odoo's price_subtotal/price_subtotal_incl are
		// not reliably signed for refunds, so qty must drive the sign.
		const r = deriveSignedLineAmounts(100, 118, -2);
		expect(r.priceSubtotal).toBe(-100);
		expect(r.taxAmount).toBe(-18);
	});

	it("keeps a refund line negative when Odoo's raw fields are already negative", () => {
		const r = deriveSignedLineAmounts(-100, -118, -2);
		expect(r.priceSubtotal).toBe(-100);
		expect(r.taxAmount).toBe(-18);
	});

	it("zero-qty edge case does not flip sign unexpectedly", () => {
		const r = deriveSignedLineAmounts(0, 0, 0);
		expect(r.priceSubtotal).toBe(0);
		expect(r.taxAmount).toBe(0);
	});
});
