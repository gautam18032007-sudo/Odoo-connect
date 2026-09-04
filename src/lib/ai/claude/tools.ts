/**
 * The approved tool registry Claude (or any future model provider) may call.
 *
 * This is the single allow-list: a tool name not present here is rejected
 * before any backend function runs — the model can never trigger arbitrary
 * code, only one of these exact, pre-defined, read-only data queries.
 */
import {
	getDashboardSummary,
	getLowStockProducts,
	getSalesByDate,
	getSalesByStore,
	getTodaySales,
	getTopCustomers,
	getTopProducts,
	type ToolResult,
} from "./data-tools";

export interface ToolDefinition {
	name: string;
	description: string;
	/** JSON Schema for the tool's input — provider-agnostic shape (Anthropic's
	 * `input_schema` and a hypothetical Gemini `parameters` field both accept
	 * plain JSON Schema, so this same object can be reused for either). */
	schema: {
		type: "object";
		properties: Record<string, { type: string; description: string }>;
		required?: string[];
	};
	run: (args: any) => Promise<ToolResult>;
}

export const TOOL_REGISTRY: ToolDefinition[] = [
	{
		name: "get_today_sales",
		description:
			"Get today's total revenue, gross collection, GST, order count, and average order value (AOV) across all stores.",
		schema: { type: "object", properties: {} },
		run: async () => getTodaySales(),
	},
	{
		name: "get_sales_by_date",
		description:
			"Get total revenue, orders, and AOV for a specific date range (inclusive).",
		schema: {
			type: "object",
			properties: {
				startDate: { type: "string", description: "Start date, YYYY-MM-DD" },
				endDate: { type: "string", description: "End date, YYYY-MM-DD" },
			},
			required: ["startDate", "endDate"],
		},
		run: async (args) => getSalesByDate(args),
	},
	{
		name: "get_sales_by_store",
		description:
			"Get revenue, orders, and AOV broken down per store. Defaults to the last 30 days if no date range is given.",
		schema: {
			type: "object",
			properties: {
				startDate: {
					type: "string",
					description: "Optional start date, YYYY-MM-DD",
				},
				endDate: {
					type: "string",
					description: "Optional end date, YYYY-MM-DD",
				},
			},
		},
		run: async (args) => getSalesByStore(args),
	},
	{
		name: "get_top_products",
		description:
			"Get the top-selling products by revenue. Defaults to the last 30 days if no date range is given.",
		schema: {
			type: "object",
			properties: {
				limit: {
					type: "number",
					description: "How many products to return (default 10, max 50)",
				},
				startDate: {
					type: "string",
					description: "Optional start date, YYYY-MM-DD",
				},
				endDate: {
					type: "string",
					description: "Optional end date, YYYY-MM-DD",
				},
			},
		},
		run: async (args) => getTopProducts(args),
	},
	{
		name: "get_low_stock_products",
		description:
			"Get products at or below a low-stock quantity threshold (default 5 units).",
		schema: {
			type: "object",
			properties: {
				threshold: {
					type: "number",
					description: "Stock quantity threshold (default 5)",
				},
				limit: {
					type: "number",
					description: "How many products to return (default 10, max 50)",
				},
			},
		},
		run: async (args) => getLowStockProducts(args),
	},
	{
		name: "get_top_customers",
		description: "Get the highest lifetime-spend customers.",
		schema: {
			type: "object",
			properties: {
				limit: {
					type: "number",
					description: "How many customers to return (default 10, max 50)",
				},
			},
		},
		run: async (args) => getTopCustomers(args),
	},
	{
		name: "get_dashboard_summary",
		description:
			"Get a combined snapshot: today's sales, the best-performing store today, and how many products are low on stock.",
		schema: { type: "object", properties: {} },
		run: async () => getDashboardSummary(),
	},
];

export function getToolDefinition(name: string): ToolDefinition | undefined {
	return TOOL_REGISTRY.find((t) => t.name === name);
}

/**
 * Executes an approved tool by name with validated arguments. Returns a
 * ToolResult even for an unknown tool name (never throws), so the caller
 * always has something safe to feed back to the model.
 */
export async function runTool(
	name: string,
	args: unknown,
): Promise<ToolResult> {
	const tool = getToolDefinition(name);
	if (!tool) {
		return { success: false, error: `Unknown tool: ${name}` };
	}
	const safeArgs = args && typeof args === "object" ? args : {};
	try {
		return await tool.run(safeArgs);
	} catch {
		return { success: false, error: `Tool ${name} failed unexpectedly.` };
	}
}
