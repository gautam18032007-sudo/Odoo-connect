import { describe, expect, it } from "vitest";
import { generateSalesForecast } from "./sales";

describe("generateSalesForecast", () => {
	it("returns an unavailable state (not a fabricated forecast) when historical data is insufficient", () => {
		const result = generateSalesForecast([
			{ date: "2026-01-01", revenue: 1000 },
			{ date: "2026-01-02", revenue: 1000 },
		]);
		expect(result.growthTrendPercent).toBeNull();
		expect(result.next30DaysRevenue).toBeNull();
		expect(result.confidencePercent).toBeNull();
		expect(result.points).toHaveLength(0);
	});

	it("returns an unavailable state for an empty series", () => {
		const result = generateSalesForecast([]);
		expect(result.growthTrendPercent).toBeNull();
		expect(result.confidencePercent).toBeNull();
	});

	it("never returns the previously-hardcoded 8.5 growth constant regardless of input shape", () => {
		const flatData = Array.from({ length: 20 }, (_, i) => ({
			date: `2026-01-${i + 1}`,
			revenue: 5000,
		}));
		const result = generateSalesForecast(flatData);
		// Flat revenue should compute to ~0% trend, never the old hardcoded 8.5.
		expect(result.growthTrendPercent).not.toBe(8.5);
		expect(result.growthTrendPercent).toBeCloseTo(0, 0);
	});

	it("derives growthTrendPercent from actual first-half vs second-half revenue, not a constant", () => {
		const growingData = [
			...Array.from({ length: 10 }, (_, i) => ({
				date: `d${i}`,
				revenue: 1000,
			})),
			...Array.from({ length: 10 }, (_, i) => ({
				date: `d${i + 10}`,
				revenue: 2000,
			})),
		];
		const result = generateSalesForecast(growingData);
		expect(result.growthTrendPercent).not.toBeNull();
		expect(result.growthTrendPercent).toBeGreaterThan(50); // ~100% real growth
	});

	it("never uses a sine wave for daily point variance — all points use the same projected value", () => {
		const data = Array.from({ length: 20 }, (_, i) => ({
			date: `d${i}`,
			revenue: 1000,
		}));
		const result = generateSalesForecast(data);
		const uniqueProjections = new Set(
			result.points.map((p) => p.projectedRevenue),
		);
		// A sine-wave implementation would produce many distinct values across
		// 30 points; a flat trend should project the same daily value each day.
		expect(uniqueProjections.size).toBe(1);
	});

	it("confidence is not a hardcoded 88 or 75, and reflects real volatility", () => {
		const stableData = Array.from({ length: 60 }, () => ({
			date: "d",
			revenue: 1000,
		}));
		const volatileData = Array.from({ length: 60 }, (_, i) => ({
			date: "d",
			revenue: i % 2 === 0 ? 100 : 5000,
		}));
		const stable = generateSalesForecast(stableData);
		const volatile = generateSalesForecast(volatileData);
		expect(stable.confidencePercent).not.toBe(88);
		expect(stable.confidencePercent).not.toBe(75);
		// A stable series must be reported as more confident than a volatile one.
		expect(stable.confidencePercent!).toBeGreaterThan(
			volatile.confidencePercent!,
		);
	});
});
