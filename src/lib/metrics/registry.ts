/**
 * ZenZebra CRM Metrics Registry & Governance Engine
 * Formal registry defining metric versions, owners, required schema fields, and validation logic.
 */

export interface MetricDefinition {
	id: string;
	name: string;
	version: string;
	category: "Sales" | "Retention" | "CRM" | "Finance";
	description: string;
	requiredFields: string[];
	owner: string;
	minVersionSupported: string;
	validationRule: (input: any) => boolean;
}

class MetricsRegistry {
	private registry: Map<string, MetricDefinition> = new Map();

	constructor() {
		this.registerDefaults();
	}

	private registerDefaults(): void {
		this.register({
			id: "AOV",
			name: "Average Order Value",
			version: "v1.0",
			category: "Sales",
			description:
				"Average net currency value per completed sales transaction.",
			requiredFields: ["net_amount", "bill_no"],
			owner: "Founder Analytics",
			minVersionSupported: "v1.0",
			validationRule: (input) => input?.orderCount > 0 && input?.revenue >= 0,
		});

		this.register({
			id: "LTV",
			name: "Customer Lifetime Value",
			version: "v1.0",
			category: "Retention",
			description:
				"Estimated cumulative customer spend over a 12-month lifecycle.",
			requiredFields: ["net_amount", "customer_mobile", "sale_date"],
			owner: "Retention Growth Team",
			minVersionSupported: "v1.0",
			validationRule: (input) => input?.aov > 0 && input?.purchaseFrequency > 0,
		});

		this.register({
			id: "CAC",
			name: "Customer Acquisition Cost",
			version: "v1.0",
			category: "Retention",
			description:
				"Blended marketing expenditure required to acquire one net new customer.",
			requiredFields: ["marketing_spend", "customer_mobile"],
			owner: "Growth Marketing",
			minVersionSupported: "v1.0",
			validationRule: (input) =>
				input?.marketingSpend >= 0 && input?.newCustomers > 0,
		});

		this.register({
			id: "RFM",
			name: "RFM Composite Score",
			version: "v1.0",
			category: "Retention",
			description:
				"Composite scoring (1-5) evaluating recency, frequency, and monetary spend.",
			requiredFields: ["sale_date", "customer_mobile", "net_amount"],
			owner: "Customer Intelligence",
			minVersionSupported: "v1.0",
			validationRule: (input) =>
				input?.lastOrderDaysAgo >= 0 && input?.orderCount >= 1,
		});

		this.register({
			id: "PIPELINE_VELOCITY",
			name: "Sales Pipeline Velocity",
			version: "v1.0",
			category: "CRM",
			description:
				"Speed at which qualified opportunity value turns into closed revenue.",
			requiredFields: ["expected_revenue", "stage", "date_deadline"],
			owner: "Sales Ops",
			minVersionSupported: "v1.0",
			validationRule: (input) =>
				input?.salesCycleDays > 0 && input?.opportunityValue >= 0,
		});
	}

	public register(metric: MetricDefinition): void {
		this.registry.set(metric.id, metric);
	}

	public get(metricId: string): MetricDefinition | undefined {
		return this.registry.get(metricId);
	}

	public getAll(): MetricDefinition[] {
		return Array.from(this.registry.values());
	}
}

export const metricsRegistry = new MetricsRegistry();
