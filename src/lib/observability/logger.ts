/**
 * ZenZebra CRM Observability & Structured Logger
 * Instruments API routes, query performance, and audit trails.
 */

export interface LogContext {
	requestId?: string;
	userId?: string;
	storeId?: string;
	path?: string;
	method?: string;
	durationMs?: number;
	queryCount?: number;
	cacheHit?: boolean;
	status?: number;
	error?: string;
}

class ObservabilityLogger {
	private generateRequestId(): string {
		return `req_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
	}

	public startRequest(
		_method: string,
		_path: string,
	): { requestId: string; startTime: number } {
		const requestId = this.generateRequestId();
		const startTime = performance.now();
		return { requestId, startTime };
	}

	public logApiPerformance(context: LogContext): void {
		const timestamp = new Date().toISOString();
		const logPayload = {
			timestamp,
			level: context.error ? "ERROR" : "INFO",
			type: "API_METRICS",
			...context,
		};

		if (process.env.NODE_ENV === "development") {
			console.log(
				`[OBSERVABILITY] ${logPayload.timestamp} | ${context.method || "GET"} ${context.path} | Status: ${context.status || 200} | Duration: ${context.durationMs?.toFixed(1)}ms | DB Queries: ${context.queryCount || 0}`,
			);
		} else {
			console.log(JSON.stringify(logPayload));
		}
	}

	public logAudit(
		actor: string,
		action: string,
		target: string,
		details: Record<string, any>,
	): void {
		const logPayload = {
			timestamp: new Date().toISOString(),
			type: "AUDIT_LOG",
			actor,
			action,
			target,
			details,
		};
		console.log(JSON.stringify(logPayload));
	}
}

export const logger = new ObservabilityLogger();
