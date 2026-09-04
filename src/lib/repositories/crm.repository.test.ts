import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the DB module so getCrmPipelineSummary()'s two sequential sql`...`
// calls (aggregate stats, then per-stage counts) resolve to controllable
// fixtures instead of hitting a real database.
let statsRows: any[] = [];
let stageRows: any[] = [];
let callIndex = 0;

vi.mock("@/lib/db", () => ({
	sql: Object.assign(
		vi.fn(async () => {
			callIndex += 1;
			return callIndex % 2 === 1 ? statsRows : stageRows;
		}),
		{},
	),
}));

const { getCrmPipelineSummary } = await import("./crm.repository");

describe("getCrmPipelineSummary — no-fabrication guarantees", () => {
	afterEach(() => {
		statsRows = [];
		stageRows = [];
		callIndex = 0;
	});

	it("returns winRate: null (not a fabricated 0%) when there are zero real leads", async () => {
		statsRows = [
			{ totalPipelineValue: 0, totalLeads: 0, avgDealSize: 0, winRate: 0 },
		];
		stageRows = [];
		const summary = await getCrmPipelineSummary();
		expect(summary.totalLeads).toBe(0);
		expect(summary.winRate).toBeNull();
	});

	it("returns a real computed winRate when real leads exist", async () => {
		statsRows = [
			{
				totalPipelineValue: 50000,
				totalLeads: 4,
				avgDealSize: 12500,
				winRate: 25,
			},
		];
		stageRows = [{ stage: "Closed Won", count: 1, value: 50000 }];
		const summary = await getCrmPipelineSummary();
		expect(summary.totalLeads).toBe(4);
		expect(summary.winRate).toBe(25);
	});
});
