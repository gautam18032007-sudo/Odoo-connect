/**
 * ZenZebra Sales CRM — Single Source of Truth KPI Governance Registry
 *
 * Every KPI in the enterprise application is cataloged here with its
 * mathematical formula, primary SQL source, calculation layer, and owner.
 */

export interface MetricDefinition {
	id: string;
	name: string;
	owner: "Finance" | "Executive" | "Customer Intelligence" | "Operations";
	formula: string;
	sqlSource: string;
	calculationFile: string;
	apiRoute: string;
	validationRule: string;
	dashboardMappings: string[];
	exportMappings: string[];
	dependencies: string[];
	certificationStatus: "Certified 100%" | "Pending Certification";
}

export const METRIC_REGISTRY: Record<string, MetricDefinition> = {
	REVENUE: {
		id: "REVENUE",
		name: "Net Revenue",
		owner: "Finance",
		formula: "SUM(net_amount)",
		sqlSource: "sales_fact_v.net_amount",
		calculationFile: "src/lib/business-logic/sales.ts",
		apiRoute: "/api/sales/dashboard",
		validationRule: "Number.isFinite(revenue) && revenue >= 0",
		dashboardMappings: [
			"/dashboard/sales",
			"/dashboard/customer-intelligence",
			"/dashboard/finance",
			"/dashboard/net-purchase",
		],
		exportMappings: ["Summary Sheet", "Customer Details Sheet"],
		dependencies: ["sales_fact_v", "upload_batches"],
		certificationStatus: "Certified 100%",
	},
	AOV: {
		id: "AOV",
		name: "Average Order Value (AOV)",
		owner: "Executive",
		formula: "SUM(net_amount) / NULLIF(COUNT(DISTINCT order_id), 0)",
		sqlSource: "sales_fact_v (net_amount, order_id)",
		calculationFile: "src/lib/business-logic/aov.ts",
		apiRoute: "/api/sales/dashboard",
		validationRule: "safeDiv(net_sales, total_bills, 0)",
		dashboardMappings: ["/dashboard/sales", "/dashboard/customer-intelligence"],
		exportMappings: ["Summary Sheet"],
		dependencies: ["sales_fact_v.net_amount", "sales_fact_v.bill_no"],
		certificationStatus: "Certified 100%",
	},
	TOTAL_BILLS: {
		id: "TOTAL_BILLS",
		name: "Total Distinct Bills",
		owner: "Operations",
		formula: "COUNT(DISTINCT order_id)",
		sqlSource: "sales_fact_v.order_id",
		calculationFile: "src/lib/business-logic/sales.ts",
		apiRoute: "/api/sales/dashboard",
		validationRule: "Number.isInteger(bills) && bills >= 0",
		dashboardMappings: ["/dashboard/sales", "/dashboard/customer-intelligence"],
		exportMappings: ["Summary Sheet", "Customer Details Sheet"],
		dependencies: ["sales_fact_v.bill_no"],
		certificationStatus: "Certified 100%",
	},
	GROSS_MARGIN: {
		id: "GROSS_MARGIN",
		name: "Gross Margin",
		owner: "Finance",
		formula: "(SUM(net_amount) - SUM(cogs)) / SUM(net_amount) * 100",
		sqlSource: "sales_fact_v",
		calculationFile: "src/lib/business-logic/margin.ts",
		apiRoute: "/api/sales/dashboard",
		validationRule: "safeDiv(net_amount - cogs, net_amount, 0) * 100",
		dashboardMappings: ["/dashboard/sales", "/dashboard/finance"],
		exportMappings: ["Finance Summary"],
		dependencies: ["sales_fact_v.net_amount", "sales_fact_v.mrp_amount"],
		certificationStatus: "Certified 100%",
	},
	LTV: {
		id: "LTV",
		name: "Customer Lifetime Value (LTV)",
		owner: "Customer Intelligence",
		formula: "SUM(net_amount) / NULLIF(COUNT(DISTINCT customer_mobile), 0)",
		sqlSource: "customer_metrics (total_revenue, customer_mobile)",
		calculationFile: "src/lib/business-logic/customer-value-distribution.ts",
		apiRoute: "/api/customer-intelligence",
		validationRule: "safeDiv(total_revenue, customer_count, 0)",
		dashboardMappings: ["/dashboard/customer-intelligence"],
		exportMappings: ["Customer Details Sheet"],
		dependencies: [
			"customer_metrics.total_revenue",
			"customer_metrics.customer_mobile",
		],
		certificationStatus: "Certified 100%",
	},
	RETENTION_PCT: {
		id: "RETENTION_PCT",
		name: "Cohort Retention %",
		owner: "Customer Intelligence",
		formula: "(Active Customers in Month N / Acquisition Cohort Size) * 100",
		sqlSource: "customer_metrics & sales_fact_v",
		calculationFile: "src/lib/business-logic/customer-retention-cohort.ts",
		apiRoute: "/api/customer-intelligence",
		validationRule: "retentionPct >= 0 && retentionPct <= 100",
		dashboardMappings: ["/dashboard/customer-intelligence"],
		exportMappings: ["Retention Cohort Sheet"],
		dependencies: [
			"customer_metrics.first_purchase_date",
			"sales_fact_v.sale_date",
		],
		certificationStatus: "Certified 100%",
	},
};

export function getMetricDefinition(metricId: string): MetricDefinition | null {
	return METRIC_REGISTRY[metricId] || null;
}
