import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the DB module before importing the function under test, so
// shouldRunHistoricalReconciliation()'s `sql` tagged-template call resolves
// to a controllable fixture instead of hitting a real database.
const mockRows: { status: string; started_at: string }[] = [];
vi.mock("../../db", () => ({
	sql: Object.assign(
		vi.fn(async () => mockRows),
		{},
	),
}));

const { shouldRunHistoricalReconciliation } = await import("./syncSales");

function setLatestRow(status: string, ageMs: number) {
	mockRows.length = 0;
	mockRows.push({
		status,
		started_at: new Date(Date.now() - ageMs).toISOString(),
	});
}

describe("shouldRunHistoricalReconciliation (F2-1 fix)", () => {
	afterEach(() => {
		mockRows.length = 0;
	});

	it("F2-TEST-03: no previous run -> allowed", async () => {
		expect(await shouldRunHistoricalReconciliation()).toBe(true);
	});

	it("F2-TEST-01: successful recent run -> throttled", async () => {
		setLatestRow("success", 1000 * 60); // 1 minute ago
		expect(await shouldRunHistoricalReconciliation(24)).toBe(false);
	});

	it("F2-TEST-05: successful run older than the window -> allowed again", async () => {
		setLatestRow("success", 25 * 60 * 60 * 1000); // 25 hours ago
		expect(await shouldRunHistoricalReconciliation(24)).toBe(true);
	});

	it("F2-TEST-02: failed recent run -> retry allowed immediately (the actual bug fix)", async () => {
		setLatestRow("failed", 1000 * 60); // 1 minute ago — would have been
		// blocked for 24h under the old started_at-only throttle logic.
		expect(await shouldRunHistoricalReconciliation(24)).toBe(true);
	});

	it("F2-TEST-04: currently running (syncing) job -> blocked", async () => {
		setLatestRow("syncing", 1000 * 60); // 1 minute ago, still fresh
		expect(await shouldRunHistoricalReconciliation(24)).toBe(false);
	});

	it("a stuck 'syncing' row older than the stuck threshold does not permanently block recovery", async () => {
		setLatestRow("syncing", 31 * 60 * 1000); // 31 minutes ago, past the 30-min stuck threshold
		expect(await shouldRunHistoricalReconciliation(24)).toBe(true);
	});
});
