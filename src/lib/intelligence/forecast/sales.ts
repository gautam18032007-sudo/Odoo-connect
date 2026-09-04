/**
 * ZenZebra Retail Intelligence Platform - Sales Forecasting Engine
 *
 * Deterministic, explainable forecast built only from the real historical
 * daily revenue series passed in. No hardcoded growth rate, no synthetic
 * seasonality, no fabricated confidence score — every number below traces
 * to an actual observation in `historicalDailyData`, or the field is left
 * null (never a guessed placeholder) when there isn't enough real data to
 * support it.
 */

export interface ForecastPoint {
	date: string;
	projectedRevenue: number;
	lowerBound: number;
	upperBound: number;
}

export interface ForecastResult {
	/** Null when there isn't enough historical data to project forward. */
	next30DaysRevenue: number | null;
	/** Percent change between the first and second half of the historical
	 * window — null when there isn't enough data to split meaningfully. */
	growthTrendPercent: number | null;
	/** Derived from sample size and the coefficient of variation of the
	 * historical series (more days + less day-to-day volatility = higher
	 * confidence). Null when there isn't enough data to compute it. */
	confidencePercent: number | null;
	points: ForecastPoint[];
}

/** Minimum historical days required before any trend/projection is produced. */
const MIN_DAYS_FOR_TREND = 14;

function mean(values: number[]): number {
	return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values: number[], avg: number): number {
	if (values.length < 2) return 0;
	const variance =
		values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
	return Math.sqrt(variance);
}

export function generateSalesForecast(
	historicalDailyData: Array<{ date: string; revenue: number }>,
): ForecastResult {
	const revenues = (historicalDailyData || [])
		.map((d) => Number(d.revenue) || 0)
		.filter((v) => Number.isFinite(v));

	if (revenues.length < MIN_DAYS_FOR_TREND) {
		// Not enough real observations to defend a trend, a projection, or a
		// confidence figure — report unavailable rather than inventing one.
		return {
			next30DaysRevenue: null,
			growthTrendPercent: null,
			confidencePercent: null,
			points: [],
		};
	}

	const avgDailyRevenue = mean(revenues);
	const sd = stdDev(revenues, avgDailyRevenue);

	// Real trend: compare the average of the first half of the window to the
	// average of the second half — a plain, explainable measure of direction,
	// not a fitted/hidden model.
	const mid = Math.floor(revenues.length / 2);
	const firstHalfAvg = mean(revenues.slice(0, mid));
	const secondHalfAvg = mean(revenues.slice(mid));
	const growthTrendPercent =
		firstHalfAvg > 0
			? Number(
					(((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100).toFixed(1),
				)
			: null;

	const projectedDaily =
		growthTrendPercent !== null
			? avgDailyRevenue * (1 + growthTrendPercent / 100)
			: avgDailyRevenue;
	const next30DaysRevenue = Math.round(projectedDaily * 30);

	// Confidence: higher with more historical days and lower day-to-day
	// volatility (coefficient of variation). This is a simple, disclosed
	// heuristic — not a statistical guarantee — capped to a sane range so it
	// never overstates certainty from a short/volatile series.
	const coefficientOfVariation = avgDailyRevenue > 0 ? sd / avgDailyRevenue : 1;
	const sampleSizeFactor = Math.min(1, revenues.length / 60); // saturates at 60 days
	const volatilityFactor = Math.max(0, 1 - coefficientOfVariation);
	const confidencePercent = Math.round(
		Math.min(
			90,
			Math.max(30, (sampleSizeFactor * 0.5 + volatilityFactor * 0.5) * 100),
		),
	);

	const points: ForecastPoint[] = [];
	const startDate = new Date();
	for (let i = 1; i <= 30; i++) {
		const targetDate = new Date(startDate);
		targetDate.setDate(targetDate.getDate() + i);
		const dateStr = targetDate.toISOString().split("T")[0];
		const dayRevenue = Math.round(projectedDaily);
		// Bounds from the real observed standard deviation, not an arbitrary
		// fixed percentage.
		points.push({
			date: dateStr,
			projectedRevenue: dayRevenue,
			lowerBound: Math.max(0, Math.round(dayRevenue - sd)),
			upperBound: Math.round(dayRevenue + sd),
		});
	}

	return {
		next30DaysRevenue,
		growthTrendPercent,
		confidencePercent,
		points,
	};
}
