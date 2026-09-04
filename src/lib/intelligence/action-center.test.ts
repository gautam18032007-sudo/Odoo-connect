import { describe, expect, it } from "vitest";
import { generateFounderActions } from "./action-center";

describe("generateFounderActions", () => {
	it("never emits a fabricated rupee impact estimate", () => {
		const actions = generateFounderActions({
			hotLeadsCount: 5,
			decliningStoresCount: 1,
			pendingProposalsCount: 2,
		});
		for (const action of actions) {
			expect(action.impactEstimate).toBeUndefined();
		}
	});

	it("never emits a fabricated confidence percentage", () => {
		const actions = generateFounderActions({
			hotLeadsCount: 5,
			decliningStoresCount: 1,
			pendingProposalsCount: 2,
		});
		for (const action of actions) {
			expect(action.confidencePercent).toBeUndefined();
		}
	});

	it("produces no actions when no real signal is provided", () => {
		const actions = generateFounderActions({});
		expect(actions).toHaveLength(0);
	});
});
