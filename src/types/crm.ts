export type Severity = "critical" | "high" | "medium" | "low";

export interface Project {
	id: string;
	referenceNo: string;
	client: string;
	category: string | null;
	typeId: string;
	typeName: string | null;
	budget: number;
	deliveryDate: Date;
	phase1Status: string;
	phase2Status: string;
	phase3Status: string;
	approvalPending: boolean;
	assigneeLastActive: Date;
	createdAt: Date;
	updatedAt: Date;
}

export interface DerivedSignals {
	id?: string;
	projectId: string;
	isDelayed: boolean;
	delayDays: number;
	isBlocked: boolean;
	blockedReason: string | null;
	inactivityHours: number;
	cascadeRisk: boolean;
	cascadeReason: string | null;
	deadlineProximity: number;
	computedAt?: Date;
}

export interface PriorityScore {
	id?: string;
	projectId: string;
	score: number;
	severity: Severity;
	reasonCodes: string[];
	recommendedAction: string | null;
	updatedAt?: Date;
}

export interface PriorityItem {
	projectId: string;
	referenceNo: string;
	client: string;
	typeId: string;
	deliveryDate: Date;
	phase1Status: string;
	phase2Status: string;
	phase3Status: string;
	approvalPending: boolean;
	score: number;
	severity: Severity;
	reasonCodes: string[];
	recommendedAction: string | null;
	cascadeRisk: boolean;
}

export interface CommandCenterSummary {
	critical: number;
	high: number;
	medium: number;
	low: number;
}

export interface CommandCenterResponse {
	priorities: PriorityItem[];
	summary: CommandCenterSummary;
	meta: {
		cached: boolean;
		computedAt: string | null;
		staleness?: string;
	};
}
