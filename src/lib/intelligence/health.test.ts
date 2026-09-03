import { describe, expect, it } from "vitest";
import { calculateBusinessHealth } from "./health";

describe("calculateBusinessHealth (no fabricated defaults)", () => {
	it("returns null overall score when no inputs are provided at all", () => {
		const r = calculateBusinessHealth({});
		expect(r.overallBusinessHealth).toBeNull();
		expect(r.revenueHealth).toBeNull();
		expect(r.customerHealth).toBeNull();
		expect(r.pipelineHealth).toBeNull();
		expect(r.cashFlowHealth).toBeNull();
		expect(r.inventoryHealth).toBeNull();
		expect(r.status).toBe("UNKNOWN");
	});

	it("never returns a fabricated inventoryHealth constant when none is supplied", () => {
		const r = calculateBusinessHealth({ revenueGrowthPercent: 10 });
		expect(r.inventoryHealth).toBeNull();
	});

	it("computes a real overall score when at least one domain has data, excluding the unknown domains from the weighted average", () => {
		const r = calculateBusinessHealth({ revenueGrowthPercent: 20 });
		// revenueGrowthPercent=20 -> revenueHealth=95 (only known domain) ->
		// weighted average over just that domain should equal 95, not a
		// blend with fabricated zeros for the other four domains.
		expect(r.revenueHealth).toBe(95);
		expect(r.overallBusinessHealth).toBe(95);
	});

	it("blends only the known domains proportionally when some inputs are provided and others are not", () => {
		const r = calculateBusinessHealth({
			revenueGrowthPercent: 20, // -> 95, weight 0.3
			closedWonRate: 35, // -> 95, weight 0.2
		});
		// Both known domains score 95, so the weighted blend must be 95
		// regardless of the other three domains being unknown.
		expect(r.overallBusinessHealth).toBe(95);
	});
});
