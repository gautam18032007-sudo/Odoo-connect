/**
 * ZenZebra Performance & Telemetry Utility (v5.0)
 * Measures execution latency for API endpoints and UI renders above the Lock Line.
 */

export interface PerformanceMetric {
	name: string;
	durationMs: number;
	timestamp: string;
	budgetMs: number;
	withinBudget: boolean;
}

export function measureLatency<T>(
	metricName: string,
	fn: () => T,
	budgetMs = 200,
): { result: T; metric: PerformanceMetric } {
	const start = performance.now();
	const result = fn();
	const durationMs = Number((performance.now() - start).toFixed(2));

	return {
		result,
		metric: {
			name: metricName,
			durationMs,
			timestamp: new Date().toISOString(),
			budgetMs,
			withinBudget: durationMs <= budgetMs,
		},
	};
}

export async function measureAsyncLatency<T>(
	metricName: string,
	fn: () => Promise<T>,
	budgetMs = 200,
): Promise<{ result: T; metric: PerformanceMetric }> {
	const start = performance.now();
	const result = await fn();
	const durationMs = Number((performance.now() - start).toFixed(2));

	return {
		result,
		metric: {
			name: metricName,
			durationMs,
			timestamp: new Date().toISOString(),
			budgetMs,
			withinBudget: durationMs <= budgetMs,
		},
	};
}
