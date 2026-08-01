export interface RevenueDriverResult {
	currentRevenue: number;
	prevRevenue: number;
	revenueGrowthPct: number | null;
	currentBillCuts: number;
	prevBillCuts: number;
	billCutsGrowthPct: number | null;
	currentAov: number;
	prevAov: number;
	aovGrowthPct: number | null;
	primaryDriver: "bill_cuts" | "aov" | "both" | "flat";
	explanation: string;
	revenueStatus: "Up" | "Down" | "Stable";
	revenueGrowth: number;
	primaryDriverText: string;
}

export function computeRevenueDriver(
	currentRevenue: number,
	prevRevenue: number,
	currentBillCuts: number,
	prevBillCuts: number,
): RevenueDriverResult {
	const currentAov = currentBillCuts > 0 ? currentRevenue / currentBillCuts : 0;
	const prevAov = prevBillCuts > 0 ? prevRevenue / prevBillCuts : 0;
	const revGrowth =
		prevRevenue > 0
			? ((currentRevenue - prevRevenue) / prevRevenue) * 100
			: null;
	const bcGrowth =
		prevBillCuts > 0
			? ((currentBillCuts - prevBillCuts) / prevBillCuts) * 100
			: null;
	const aovGrowth =
		prevAov > 0 ? ((currentAov - prevAov) / prevAov) * 100 : null;
	const absBc = Math.abs(bcGrowth ?? 0);
	const absAov = Math.abs(aovGrowth ?? 0);
	let primaryDriver: RevenueDriverResult["primaryDriver"] = "flat";
	let explanation = "Revenue is stable vs previous period.";
	if (absBc > 2 || absAov > 2) {
		if (absBc > absAov * 1.5) {
			primaryDriver = "bill_cuts";
			explanation = `Revenue ${(revGrowth ?? 0) < 0 ? "down" : "up"} ${Math.abs(revGrowth ?? 0).toFixed(1)}% — Main cause: Bill Cuts ${(bcGrowth ?? 0) < 0 ? "down" : "up"} ${Math.abs(bcGrowth ?? 0).toFixed(1)}%. AOV stable.`;
		} else if (absAov > absBc * 1.5) {
			primaryDriver = "aov";
			explanation = `Revenue ${(revGrowth ?? 0) < 0 ? "down" : "up"} ${Math.abs(revGrowth ?? 0).toFixed(1)}% — Main cause: AOV ${(aovGrowth ?? 0) < 0 ? "down" : "up"} ${Math.abs(aovGrowth ?? 0).toFixed(1)}%. Bill Cuts stable.`;
		} else {
			primaryDriver = "both";
			explanation = `Revenue ${(revGrowth ?? 0) < 0 ? "down" : "up"} ${Math.abs(revGrowth ?? 0).toFixed(1)}% — Both Bill Cuts (${bcGrowth?.toFixed(1)}%) and AOV (${aovGrowth?.toFixed(1)}%) moved.`;
		}
	}
	const revenueGrowth = revGrowth ?? 0;
	return {
		currentRevenue,
		prevRevenue,
		revenueGrowthPct:
			revGrowth !== null ? Math.round(revGrowth * 10) / 10 : null,
		currentBillCuts,
		prevBillCuts,
		billCutsGrowthPct:
			bcGrowth !== null ? Math.round(bcGrowth * 10) / 10 : null,
		currentAov: Math.round(currentAov * 100) / 100,
		prevAov: Math.round(prevAov * 100) / 100,
		aovGrowthPct: aovGrowth !== null ? Math.round(aovGrowth * 10) / 10 : null,
		primaryDriver,
		explanation,
		revenueStatus:
			revenueGrowth > 0 ? "Up" : revenueGrowth < 0 ? "Down" : "Stable",
		revenueGrowth,
		primaryDriverText: explanation,
	};
}

export function analyzeRevenueDriver(
	currentRevenue: number,
	prevRevenue: number,
	currentBillCuts: number,
	prevBillCuts: number,
) {
	const r = computeRevenueDriver(
		currentRevenue,
		prevRevenue,
		currentBillCuts,
		prevBillCuts,
	);
	return {
		revenueStatus: r.revenueStatus,
		revenueGrowth: r.revenueGrowth,
		primaryDriver: r.explanation,
	};
}
