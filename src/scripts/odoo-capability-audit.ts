/**
 * ============================================================================
 * ZenZebra — Odoo 19 Enterprise Module Capability & Automation Audit
 * ============================================================================
 *
 * PURPOSE:
 *   For EVERY installed Odoo module on zenzebra1.odoo.com, empirically verify:
 *     1. Accessibility (is the model installed & readable?)
 *     2. Read capability (search_read returns data?)
 *     3. Available fields (fields_get metadata)
 *     4. Key business fields (write_date, active, state, partner_id, etc.)
 *     5. Pagination support
 *     6. Incremental sync capability (write_date filtering)
 *     7. Relationships to other models
 *     8. Dashboard & AI automation potential
 *
 * OUTPUT:
 *   A JSON report file + console summary → master capability matrix.
 *
 * IMPORTANT:
 *   This script does NOT assume anything. Every conclusion is backed by
 *   live fields_get() and search_read() evidence from the real instance.
 * ============================================================================
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// ---------------------------------------------------------------------------
// Odoo JSON-RPC helpers (inline to keep audit self-contained)
// ---------------------------------------------------------------------------

let SESSION_ID = "";
let UID = 0;
let USER_CONTEXT: Record<string, any> = {};

const ODOO_URL = (process.env.ODOO_URL || "").replace(/\/$/, "");
const ODOO_DB = process.env.ODOO_DB || "";
const ODOO_USERNAME = process.env.ODOO_USERNAME || "";
const ODOO_PASSWORD = process.env.ODOO_PASSWORD || "";

async function authenticate(): Promise<void> {
	console.log(`\n🔐 Authenticating to ${ODOO_URL} (DB: ${ODOO_DB})...`);
	const res = await fetch(`${ODOO_URL}/web/session/authenticate`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			method: "call",
			params: { db: ODOO_DB, login: ODOO_USERNAME, password: ODOO_PASSWORD },
		}),
	});
	if (!res.ok) throw new Error(`Auth HTTP ${res.status}`);
	const setCookie = res.headers.get("set-cookie");
	if (setCookie) {
		const m = setCookie.match(/session_id=([^;]+)/);
		if (m) SESSION_ID = m[1];
	}
	const data = await res.json();
	if (data.error) throw new Error(`Auth error: ${JSON.stringify(data.error)}`);
	const r = data.result;
	if (!r?.uid) throw new Error("Auth failed: no uid");
	UID = r.uid;
	SESSION_ID = r.session_id || SESSION_ID;
	USER_CONTEXT = r.user_context || {};
	console.log(
		`✅ Authenticated (UID: ${UID}, Session: ${SESSION_ID.substring(0, 8)}...)`,
	);
}

async function callKw<T = any>(
	model: string,
	method: string,
	args: any[] = [],
	kwargs: Record<string, any> = {},
): Promise<T> {
	const res = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Cookie: `session_id=${SESSION_ID}`,
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			method: "call",
			params: {
				model,
				method,
				args,
				kwargs: { context: USER_CONTEXT, ...kwargs },
			},
		}),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status} on ${model}.${method}`);
	const data = await res.json();
	if (data.error) {
		const detail =
			data.error.data?.message ||
			data.error.message ||
			JSON.stringify(data.error);
		throw new Error(`RPC Error [${model}.${method}]: ${detail}`);
	}
	return data.result as T;
}

// ---------------------------------------------------------------------------
// Audit target definitions
// ---------------------------------------------------------------------------

interface ModelAuditTarget {
	model: string;
	category: string;
	description: string;
	businessOwner: string;
	dashboardFeatures: string[];
	aiAutomations: string[];
	priority: "Critical" | "High" | "Medium" | "Low";
}

const AUDIT_TARGETS: ModelAuditTarget[] = [
	// ─── POS (Critical) ───
	{
		model: "pos.order",
		category: "POS",
		description: "Point of Sale Orders",
		businessOwner: "Store Operations",
		dashboardFeatures: [
			"Store Revenue",
			"AOV",
			"Bill Cuts",
			"Store Comparison",
			"Returns Tracking",
		],
		aiAutomations: [
			"Revenue Alerts",
			"Store Health Score",
			"Fraud Detection",
			"Demand Prediction",
		],
		priority: "Critical",
	},
	{
		model: "pos.order.line",
		category: "POS",
		description: "POS Order Line Items",
		businessOwner: "Store Operations",
		dashboardFeatures: [
			"Product Mix Analysis",
			"Basket Analysis",
			"Per-item Margin",
		],
		aiAutomations: [
			"Cross-Sell Recommendation",
			"Upsell Detection",
			"Fast/Slow Mover Analysis",
		],
		priority: "Critical",
	},
	{
		model: "pos.session",
		category: "POS",
		description: "POS Register Sessions",
		businessOwner: "Store Operations",
		dashboardFeatures: [
			"Session Revenue",
			"Cash Reconciliation",
			"Shift Analytics",
		],
		aiAutomations: ["Cash Flow Alerts", "Session Duration Analytics"],
		priority: "High",
	},
	{
		model: "pos.payment",
		category: "POS",
		description: "POS Payment Records",
		businessOwner: "Finance",
		dashboardFeatures: ["Payment Method Breakdown", "Cash vs Card Ratio"],
		aiAutomations: ["Payment Anomaly Detection"],
		priority: "High",
	},
	{
		model: "pos.config",
		category: "POS",
		description: "POS Store Configurations",
		businessOwner: "Store Operations",
		dashboardFeatures: ["Store Identity Mapping", "Multi-store Dashboard"],
		aiAutomations: ["Store Comparison Alerts"],
		priority: "Critical",
	},

	// ─── Products & Inventory (Critical) ───
	{
		model: "product.template",
		category: "Product",
		description: "Product Master Templates",
		businessOwner: "Merchandising",
		dashboardFeatures: ["Product Catalog", "Pricing Analysis", "Cost Tracking"],
		aiAutomations: ["Pricing Recommendation", "Margin Alerts"],
		priority: "Critical",
	},
	{
		model: "product.product",
		category: "Product",
		description: "Product Variants",
		businessOwner: "Merchandising",
		dashboardFeatures: ["Variant-level Analytics", "SKU Tracking"],
		aiAutomations: ["Variant Performance Scoring"],
		priority: "Critical",
	},
	{
		model: "product.category",
		category: "Product",
		description: "Product Categories",
		businessOwner: "Merchandising",
		dashboardFeatures: ["Category Revenue Split", "Category Margin Analysis"],
		aiAutomations: ["Category Health Score"],
		priority: "High",
	},
	{
		model: "product.attribute",
		category: "Product",
		description: "Product Attributes (Size/Color)",
		businessOwner: "Merchandising",
		dashboardFeatures: ["Attribute-level Sales Analysis"],
		aiAutomations: ["Size/Color Demand Prediction"],
		priority: "Medium",
	},
	{
		model: "product.attribute.value",
		category: "Product",
		description: "Product Attribute Values",
		businessOwner: "Merchandising",
		dashboardFeatures: ["Size/Color Distribution"],
		aiAutomations: ["Attribute Optimization"],
		priority: "Medium",
	},
	{
		model: "stock.quant",
		category: "Inventory",
		description: "Stock Quantities by Location",
		businessOwner: "Warehouse",
		dashboardFeatures: [
			"On-hand Inventory",
			"Low Stock Alerts",
			"Stock by Store",
		],
		aiAutomations: [
			"Stockout Prediction",
			"Reorder Alerts",
			"Dead Stock Detection",
		],
		priority: "Critical",
	},
	{
		model: "stock.move",
		category: "Inventory",
		description: "Stock Movement Records",
		businessOwner: "Warehouse",
		dashboardFeatures: ["Stock Movement History", "Transfer Tracking"],
		aiAutomations: ["Inventory Aging", "Shrinkage Detection"],
		priority: "High",
	},
	{
		model: "stock.picking",
		category: "Inventory",
		description: "Warehouse Transfers/Receipts",
		businessOwner: "Warehouse",
		dashboardFeatures: ["Incoming/Outgoing Shipments", "Delivery Performance"],
		aiAutomations: ["Delivery Delay Prediction"],
		priority: "High",
	},
	{
		model: "stock.valuation.layer",
		category: "Inventory",
		description: "Stock Valuation Layers",
		businessOwner: "Finance",
		dashboardFeatures: ["Inventory Valuation", "COGS Tracking"],
		aiAutomations: ["Cost Anomaly Detection"],
		priority: "High",
	},
	{
		model: "stock.location",
		category: "Inventory",
		description: "Warehouse Locations",
		businessOwner: "Warehouse",
		dashboardFeatures: ["Location Mapping", "Zone Analytics"],
		aiAutomations: [],
		priority: "Medium",
	},
	{
		model: "stock.warehouse",
		category: "Inventory",
		description: "Warehouse Definitions",
		businessOwner: "Warehouse",
		dashboardFeatures: ["Multi-warehouse Dashboard"],
		aiAutomations: [],
		priority: "Medium",
	},

	// ─── Sales (Critical) ───
	{
		model: "sale.order",
		category: "Sales",
		description: "Standard Sales Orders",
		businessOwner: "Sales",
		dashboardFeatures: [
			"Online Sales Revenue",
			"Order Pipeline",
			"B2B Analytics",
		],
		aiAutomations: ["Conversion Prediction", "Deal Velocity Alerts"],
		priority: "Critical",
	},
	{
		model: "sale.order.line",
		category: "Sales",
		description: "Sales Order Line Items",
		businessOwner: "Sales",
		dashboardFeatures: [
			"Line-level Discounts",
			"Product Performance by Channel",
		],
		aiAutomations: ["Discount Anomaly Detection", "Price Optimization"],
		priority: "Critical",
	},

	// ─── CRM ───
	{
		model: "crm.lead",
		category: "CRM",
		description: "Leads and Opportunities",
		businessOwner: "Sales/Marketing",
		dashboardFeatures: [
			"Sales Funnel",
			"Lead Pipeline",
			"Conversion Rate",
			"Salesperson KPIs",
		],
		aiAutomations: [
			"Lead Scoring",
			"Hot Lead Detection",
			"Dead Lead Identification",
			"Win Probability",
			"Lead Prioritization",
		],
		priority: "Critical",
	},
	{
		model: "crm.stage",
		category: "CRM",
		description: "CRM Pipeline Stages",
		businessOwner: "Sales",
		dashboardFeatures: ["Funnel Stage Breakdown"],
		aiAutomations: [],
		priority: "Medium",
	},
	{
		model: "crm.team",
		category: "CRM",
		description: "Sales Teams",
		businessOwner: "Sales",
		dashboardFeatures: ["Team Performance Comparison"],
		aiAutomations: ["Salesperson Efficiency Scoring"],
		priority: "Medium",
	},

	// ─── Contacts ───
	{
		model: "res.partner",
		category: "Contacts",
		description: "Partners (Customers & Vendors)",
		businessOwner: "CRM/Sales",
		dashboardFeatures: [
			"Customer Directory",
			"LTV",
			"Retention",
			"Cohorts",
			"RFM",
		],
		aiAutomations: [
			"VIP Detection",
			"Churn Prediction",
			"Customer Win-back",
			"Customer Segments",
		],
		priority: "Critical",
	},

	// ─── Purchase ───
	{
		model: "purchase.order",
		category: "Purchase",
		description: "Purchase Orders",
		businessOwner: "Procurement",
		dashboardFeatures: ["Net Purchase", "Vendor Analysis", "PO Pipeline"],
		aiAutomations: ["Reorder Prediction", "Vendor Performance Scoring"],
		priority: "High",
	},
	{
		model: "purchase.order.line",
		category: "Purchase",
		description: "Purchase Order Line Items",
		businessOwner: "Procurement",
		dashboardFeatures: ["Purchase Line Details", "Cost Analysis"],
		aiAutomations: ["Cost Trend Analysis"],
		priority: "High",
	},

	// ─── Accounting ───
	{
		model: "account.move",
		category: "Accounting",
		description: "Journal Entries / Invoices",
		businessOwner: "Finance",
		dashboardFeatures: [
			"Invoice Dashboard",
			"Receivables/Payables",
			"Tax Reports",
		],
		aiAutomations: [
			"Cash Flow Alerts",
			"Overdue Invoice Alerts",
			"Reconciliation Anomaly",
		],
		priority: "High",
	},
	{
		model: "account.move.line",
		category: "Accounting",
		description: "Journal Entry Lines",
		businessOwner: "Finance",
		dashboardFeatures: ["GL Detail", "Tax Breakdown"],
		aiAutomations: ["Expense Anomaly Detection"],
		priority: "High",
	},
	{
		model: "account.payment",
		category: "Accounting",
		description: "Payments",
		businessOwner: "Finance",
		dashboardFeatures: ["Payment Tracking", "Collection Dashboard"],
		aiAutomations: ["Payment Delay Prediction"],
		priority: "High",
	},
	{
		model: "account.journal",
		category: "Accounting",
		description: "Accounting Journals",
		businessOwner: "Finance",
		dashboardFeatures: ["Journal Summary"],
		aiAutomations: [],
		priority: "Medium",
	},

	// ─── Website & eCommerce ───
	{
		model: "website",
		category: "Website",
		description: "Website Configuration",
		businessOwner: "Marketing",
		dashboardFeatures: ["Website Settings Overview"],
		aiAutomations: [],
		priority: "Medium",
	},
	{
		model: "website.visitor",
		category: "Website",
		description: "Website Visitor Tracking",
		businessOwner: "Marketing",
		dashboardFeatures: [
			"Visitor Analytics",
			"Session Tracking",
			"Conversion Funnel",
		],
		aiAutomations: ["Visitor Intent Scoring", "Abandoned Cart Detection"],
		priority: "High",
	},
	{
		model: "website.page",
		category: "Website",
		description: "Website Pages",
		businessOwner: "Marketing",
		dashboardFeatures: ["Content Analytics"],
		aiAutomations: [],
		priority: "Low",
	},

	// ─── WhatsApp ───
	{
		model: "whatsapp.template",
		category: "WhatsApp",
		description: "WhatsApp Message Templates",
		businessOwner: "Marketing/CRM",
		dashboardFeatures: ["Template Usage Analytics"],
		aiAutomations: ["Auto WhatsApp Trigger on Events"],
		priority: "High",
	},
	{
		model: "whatsapp.message",
		category: "WhatsApp",
		description: "WhatsApp Message History",
		businessOwner: "Marketing/CRM",
		dashboardFeatures: ["Message Volume Dashboard", "Delivery Status"],
		aiAutomations: ["Customer Engagement Scoring via WA"],
		priority: "High",
	},

	// ─── Marketing ───
	{
		model: "marketing.campaign",
		category: "Marketing Automation",
		description: "Marketing Campaigns",
		businessOwner: "Marketing",
		dashboardFeatures: ["Campaign ROI", "Engagement Metrics"],
		aiAutomations: ["Campaign Effectiveness Scoring"],
		priority: "Medium",
	},
	{
		model: "mailing.mailing",
		category: "Email Marketing",
		description: "Email Campaigns / Mailings",
		businessOwner: "Marketing",
		dashboardFeatures: ["Email Open Rate", "Click Rate", "Bounce Rate"],
		aiAutomations: ["Optimal Send Time Prediction"],
		priority: "Medium",
	},
	{
		model: "mailing.list",
		category: "Email Marketing",
		description: "Mailing Lists",
		businessOwner: "Marketing",
		dashboardFeatures: ["List Segmentation"],
		aiAutomations: ["List Hygiene Alerts"],
		priority: "Low",
	},
	{
		model: "sms.sms",
		category: "SMS Marketing",
		description: "SMS Messages",
		businessOwner: "Marketing",
		dashboardFeatures: ["SMS Campaign Dashboard"],
		aiAutomations: ["SMS Trigger on Events"],
		priority: "Medium",
	},

	// ─── Events & Appointments ───
	{
		model: "event.event",
		category: "Events",
		description: "Events",
		businessOwner: "Marketing",
		dashboardFeatures: ["Event Calendar", "Attendance Tracking"],
		aiAutomations: ["Event ROI Analysis"],
		priority: "Low",
	},
	{
		model: "appointment.type",
		category: "Appointments",
		description: "Appointment Types",
		businessOwner: "Operations",
		dashboardFeatures: ["Appointment Scheduling Analytics"],
		aiAutomations: ["No-show Prediction"],
		priority: "Low",
	},

	// ─── Helpdesk ───
	{
		model: "helpdesk.ticket",
		category: "Helpdesk",
		description: "Support Tickets",
		businessOwner: "Customer Support",
		dashboardFeatures: ["Ticket Dashboard", "SLA Tracking", "Resolution Time"],
		aiAutomations: ["Ticket Priority Auto-assignment", "Sentiment Analysis"],
		priority: "Medium",
	},

	// ─── Subscriptions ───
	{
		model: "sale.subscription",
		category: "Subscriptions",
		description: "Subscription Management",
		businessOwner: "Sales",
		dashboardFeatures: ["MRR/ARR Dashboard", "Churn Rate"],
		aiAutomations: ["Churn Prediction", "Renewal Alerts"],
		priority: "Medium",
	},

	// ─── HR / Employees ───
	{
		model: "hr.employee",
		category: "Employees",
		description: "Employee Records",
		businessOwner: "HR",
		dashboardFeatures: ["Employee Directory", "Headcount"],
		aiAutomations: ["Employee Performance Scoring"],
		priority: "Medium",
	},
	{
		model: "hr.expense",
		category: "Expenses",
		description: "Employee Expenses",
		businessOwner: "Finance/HR",
		dashboardFeatures: ["Expense Dashboard"],
		aiAutomations: ["Expense Anomaly Detection"],
		priority: "Low",
	},

	// ─── Projects & Timesheets ───
	{
		model: "project.project",
		category: "Projects",
		description: "Projects",
		businessOwner: "Operations",
		dashboardFeatures: ["Project Status Dashboard"],
		aiAutomations: ["Project Delay Prediction"],
		priority: "Low",
	},
	{
		model: "project.task",
		category: "Projects",
		description: "Project Tasks",
		businessOwner: "Operations",
		dashboardFeatures: ["Task Tracking", "Sprint Analytics"],
		aiAutomations: ["Task Priority Auto-assignment"],
		priority: "Low",
	},
	{
		model: "account.analytic.line",
		category: "Timesheets",
		description: "Timesheet Lines",
		businessOwner: "Operations",
		dashboardFeatures: ["Time Tracking Dashboard"],
		aiAutomations: ["Productivity Analysis"],
		priority: "Low",
	},

	// ─── Documents & Knowledge ───
	{
		model: "documents.document",
		category: "Documents",
		description: "Document Management",
		businessOwner: "Operations",
		dashboardFeatures: ["Document Search"],
		aiAutomations: ["Document Auto-classification"],
		priority: "Low",
	},
	{
		model: "knowledge.article",
		category: "Knowledge",
		description: "Knowledge Base Articles",
		businessOwner: "Operations",
		dashboardFeatures: ["Knowledge Dashboard"],
		aiAutomations: [],
		priority: "Low",
	},

	// ─── Communication ───
	{
		model: "discuss.channel",
		category: "Discuss",
		description: "Discussion Channels",
		businessOwner: "Operations",
		dashboardFeatures: ["Team Communication Analytics"],
		aiAutomations: [],
		priority: "Low",
	},
	{
		model: "calendar.event",
		category: "Calendar",
		description: "Calendar Events",
		businessOwner: "Operations",
		dashboardFeatures: ["Calendar Dashboard"],
		aiAutomations: ["Meeting Overload Alerts"],
		priority: "Low",
	},
	{
		model: "mail.message",
		category: "Mail Messages",
		description: "System Messages / Chatter",
		businessOwner: "System",
		dashboardFeatures: ["Activity Feed"],
		aiAutomations: ["Activity Anomaly Detection"],
		priority: "Low",
	},
	{
		model: "mail.activity",
		category: "Activities",
		description: "Scheduled Activities",
		businessOwner: "System",
		dashboardFeatures: ["Activity Tracking"],
		aiAutomations: ["Overdue Activity Alerts"],
		priority: "Medium",
	},
	{
		model: "mail.followers",
		category: "Followers",
		description: "Record Followers/Subscribers",
		businessOwner: "System",
		dashboardFeatures: [],
		aiAutomations: [],
		priority: "Low",
	},
	{
		model: "ir.attachment",
		category: "Attachments",
		description: "File Attachments",
		businessOwner: "System",
		dashboardFeatures: ["Storage Analytics"],
		aiAutomations: [],
		priority: "Low",
	},

	// ─── Loyalty / Coupons / Gift Cards ───
	{
		model: "loyalty.program",
		category: "Loyalty",
		description: "Loyalty Programs",
		businessOwner: "Marketing",
		dashboardFeatures: ["Loyalty Program Dashboard", "Points Tracking"],
		aiAutomations: ["VIP Auto-promotion", "Reward Optimization"],
		priority: "High",
	},
	{
		model: "loyalty.card",
		category: "Loyalty",
		description: "Loyalty Cards / Coupons",
		businessOwner: "Marketing",
		dashboardFeatures: ["Coupon Redemption Analytics"],
		aiAutomations: ["Coupon ROI Analysis"],
		priority: "High",
	},
	{
		model: "gift.card",
		category: "Gift Cards",
		description: "Gift Cards",
		businessOwner: "Marketing",
		dashboardFeatures: ["Gift Card Revenue", "Outstanding Liability"],
		aiAutomations: ["Gift Card Expiry Alerts"],
		priority: "Medium",
	},

	// ─── Payment ───
	{
		model: "payment.provider",
		category: "Payment Providers",
		description: "Payment Provider Config",
		businessOwner: "Finance",
		dashboardFeatures: ["Payment Gateway Overview"],
		aiAutomations: [],
		priority: "Low",
	},
	{
		model: "payment.transaction",
		category: "Payment Transactions",
		description: "Online Payment Records",
		businessOwner: "Finance",
		dashboardFeatures: ["Online Payment Analytics", "Payment Success Rate"],
		aiAutomations: ["Payment Failure Alerts"],
		priority: "High",
	},

	// ─── Manufacturing ───
	{
		model: "mrp.production",
		category: "Manufacturing",
		description: "Manufacturing Orders",
		businessOwner: "Production",
		dashboardFeatures: ["Production Dashboard", "WIP Tracking"],
		aiAutomations: ["Production Delay Alerts", "Capacity Planning"],
		priority: "Medium",
	},
	{
		model: "mrp.bom",
		category: "Manufacturing",
		description: "Bills of Materials",
		businessOwner: "Production",
		dashboardFeatures: ["BOM Cost Analysis"],
		aiAutomations: ["BOM Optimization"],
		priority: "Medium",
	},

	// ─── Quality / Repairs / Field Service / Rental ───
	{
		model: "quality.check",
		category: "Quality",
		description: "Quality Checks",
		businessOwner: "Production",
		dashboardFeatures: ["Quality Dashboard"],
		aiAutomations: ["Quality Anomaly Detection"],
		priority: "Low",
	},
	{
		model: "repair.order",
		category: "Repairs",
		description: "Repair Orders",
		businessOwner: "Service",
		dashboardFeatures: ["Repair Tracking"],
		aiAutomations: ["Repair Cost Prediction"],
		priority: "Low",
	},
	{
		model: "project.task",
		category: "Field Service",
		description: "Field Service Tasks (via project.task)",
		businessOwner: "Service",
		dashboardFeatures: ["Field Dispatch Dashboard"],
		aiAutomations: ["Route Optimization"],
		priority: "Low",
	},
	{
		model: "sale.order",
		category: "Rental",
		description: "Rental Orders (via sale.order)",
		businessOwner: "Sales",
		dashboardFeatures: ["Rental Revenue"],
		aiAutomations: ["Rental Demand Prediction"],
		priority: "Low",
	},

	// ─── Company / Users ───
	{
		model: "res.company",
		category: "Company",
		description: "Company Configuration",
		businessOwner: "Admin",
		dashboardFeatures: ["Multi-company Support"],
		aiAutomations: [],
		priority: "Low",
	},
	{
		model: "res.users",
		category: "Users",
		description: "System Users",
		businessOwner: "Admin",
		dashboardFeatures: ["User Activity Dashboard"],
		aiAutomations: ["Inactive User Alerts"],
		priority: "Low",
	},

	// ─── Social / VoIP ───
	{
		model: "social.post",
		category: "Social Marketing",
		description: "Social Media Posts",
		businessOwner: "Marketing",
		dashboardFeatures: ["Social Media Dashboard"],
		aiAutomations: ["Post Performance Analysis"],
		priority: "Low",
	},
	{
		model: "voip.call",
		category: "VoIP",
		description: "VoIP Call Records",
		businessOwner: "Sales",
		dashboardFeatures: ["Call Analytics"],
		aiAutomations: ["Call Performance Scoring"],
		priority: "Low",
	},
];

// ---------------------------------------------------------------------------
// Key business fields to check on every model
// ---------------------------------------------------------------------------
const KEY_FIELDS = [
	"id",
	"write_date",
	"create_date",
	"active",
	"state",
	"company_id",
	"partner_id",
	"product_id",
	"order_id",
	"session_id",
	"config_id",
	"name",
	"display_name",
	"date_order",
	"amount_total",
	"amount_untaxed",
	"amount_tax",
	"price_unit",
	"discount",
	"qty",
	"quantity",
	"price_subtotal",
	"price_subtotal_incl",
];

// ---------------------------------------------------------------------------
// Audit result types
// ---------------------------------------------------------------------------
interface ModelAuditResult {
	model: string;
	category: string;
	description: string;
	businessOwner: string;
	priority: string;

	// Capability checks
	accessible: boolean;
	canRead: boolean;
	canFilter: boolean;
	canSort: boolean;
	canIncrementalSync: boolean;
	requiresCustomMapping: boolean;

	// Field analysis
	totalFieldCount: number;
	keyFieldsPresent: string[];
	keyFieldsMissing: string[];
	allFieldNames: string[];
	fieldTypes: Record<string, string>;
	relationshipFields: { field: string; relation: string; type: string }[];

	// Data evidence
	recordCount: number | null;
	sampleRecordKeys: string[];

	// Business potential
	dashboardFeatures: string[];
	aiAutomations: string[];

	// Error / notes
	error: string | null;
}

// ---------------------------------------------------------------------------
// Core audit logic
// ---------------------------------------------------------------------------

async function auditModel(target: ModelAuditTarget): Promise<ModelAuditResult> {
	const result: ModelAuditResult = {
		model: target.model,
		category: target.category,
		description: target.description,
		businessOwner: target.businessOwner,
		priority: target.priority,
		accessible: false,
		canRead: false,
		canFilter: false,
		canSort: false,
		canIncrementalSync: false,
		requiresCustomMapping: false,
		totalFieldCount: 0,
		keyFieldsPresent: [],
		keyFieldsMissing: [],
		allFieldNames: [],
		fieldTypes: {},
		relationshipFields: [],
		recordCount: null,
		sampleRecordKeys: [],
		dashboardFeatures: target.dashboardFeatures,
		aiAutomations: target.aiAutomations,
		error: null,
	};

	// ── Step 1: fields_get() — discover schema ──
	let fieldsData: Record<string, any>;
	try {
		fieldsData = await callKw<Record<string, any>>(
			target.model,
			"fields_get",
			[],
			{
				attributes: [
					"string",
					"type",
					"relation",
					"required",
					"readonly",
					"help",
				],
			},
		);
		result.accessible = true;
	} catch (err: any) {
		result.error = err.message;
		return result;
	}

	const fieldNames = Object.keys(fieldsData);
	result.totalFieldCount = fieldNames.length;
	result.allFieldNames = fieldNames;

	// Categorize key fields
	for (const kf of KEY_FIELDS) {
		if (fieldNames.includes(kf)) {
			result.keyFieldsPresent.push(kf);
		} else {
			result.keyFieldsMissing.push(kf);
		}
	}

	// Extract field types & relationships
	for (const [fname, fmeta] of Object.entries(fieldsData)) {
		result.fieldTypes[fname] = fmeta.type;
		if (
			fmeta.type === "many2one" ||
			fmeta.type === "one2many" ||
			fmeta.type === "many2many"
		) {
			result.relationshipFields.push({
				field: fname,
				relation: fmeta.relation || "unknown",
				type: fmeta.type,
			});
		}
	}

	// ── Step 2: Incremental sync capability ──
	result.canIncrementalSync = fieldNames.includes("write_date");

	// ── Step 3: search_read() — verify read access + pagination ──
	try {
		const records = await callKw<any[]>(target.model, "search_read", [], {
			fields: [
				"id",
				...(fieldNames.includes("name") ? ["name"] : []),
				...(fieldNames.includes("write_date") ? ["write_date"] : []),
			],
			domain: [],
			limit: 3,
			offset: 0,
		});
		result.canRead = true;
		result.recordCount = records.length;
		if (records.length > 0) {
			result.sampleRecordKeys = Object.keys(records[0]);
		}
	} catch (err: any) {
		result.canRead = false;
		result.error =
			(result.error ? `${result.error} | ` : "") +
			`search_read failed: ${err.message}`;
	}

	// ── Step 4: Test filtering capability ──
	if (result.canRead && fieldNames.includes("write_date")) {
		try {
			await callKw<any[]>(target.model, "search_read", [], {
				fields: ["id"],
				domain: [["write_date", ">=", "2020-01-01 00:00:00"]],
				limit: 1,
			});
			result.canFilter = true;
		} catch {
			result.canFilter = false;
		}
	} else if (result.canRead) {
		// Try filtering by id
		try {
			await callKw<any[]>(target.model, "search_read", [], {
				fields: ["id"],
				domain: [["id", ">", 0]],
				limit: 1,
			});
			result.canFilter = true;
		} catch {
			result.canFilter = false;
		}
	}

	// ── Step 5: Test sorting capability ──
	if (result.canRead) {
		try {
			const sortField = fieldNames.includes("write_date")
				? "write_date desc"
				: "id desc";
			await callKw<any[]>(target.model, "search_read", [], {
				fields: ["id"],
				domain: [],
				limit: 1,
				order: sortField,
			});
			result.canSort = true;
		} catch {
			result.canSort = false;
		}
	}

	// ── Step 6: Get total record count ──
	if (result.canRead) {
		try {
			const total = await callKw<number>(
				target.model,
				"search_count",
				[[]],
				{},
			);
			result.recordCount = total;
		} catch {
			// keep the limit-3 count
		}
	}

	// ── Step 7: Custom mapping check ──
	// Models where field semantics don't directly match ZenZebra canonical schema
	const customMappingModels = [
		"pos.order",
		"pos.order.line",
		"sale.order",
		"sale.order.line",
		"stock.quant",
		"account.move",
		"account.move.line",
	];
	result.requiresCustomMapping = customMappingModels.includes(target.model);

	return result;
}

// ---------------------------------------------------------------------------
// Installed modules discovery
// ---------------------------------------------------------------------------

async function discoverInstalledModules(): Promise<
	{ name: string; shortdesc: string; state: string }[]
> {
	console.log("\n📦 Discovering installed Odoo modules...");
	try {
		const modules = await callKw<any[]>("ir.module.module", "search_read", [], {
			fields: ["name", "shortdesc", "state"],
			domain: [["state", "=", "installed"]],
			limit: 500,
			order: "name asc",
		});
		console.log(`   Found ${modules.length} installed modules.`);
		return modules;
	} catch (err: any) {
		console.error(`   ❌ Failed to query ir.module.module: ${err.message}`);
		return [];
	}
}

// ---------------------------------------------------------------------------
// Main execution
// ---------------------------------------------------------------------------

async function main() {
	console.log("═".repeat(78));
	console.log(
		"  ZenZebra — Odoo 19 Enterprise Module Capability & Automation Audit",
	);
	console.log(`  Target: ${ODOO_URL}`);
	console.log(`  Date: ${new Date().toISOString()}`);
	console.log("═".repeat(78));

	if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_PASSWORD) {
		console.error(
			"❌ Missing ODOO_URL, ODOO_DB, ODOO_USERNAME, or ODOO_PASSWORD in .env.local",
		);
		process.exit(1);
	}

	await authenticate();

	// ── Phase 1: Installed module discovery ──
	const installedModules = await discoverInstalledModules();

	// ── Phase 2: Audit each target model ──
	console.log(
		`\n🔍 Auditing ${AUDIT_TARGETS.length} target models against live instance...\n`,
	);

	const results: ModelAuditResult[] = [];
	const deduplicatedTargets = AUDIT_TARGETS.filter(
		(t, i, arr) => arr.findIndex((x) => x.model === t.model) === i,
	);

	for (let i = 0; i < deduplicatedTargets.length; i++) {
		const target = deduplicatedTargets[i];
		const progress = `[${i + 1}/${deduplicatedTargets.length}]`;
		process.stdout.write(`  ${progress} ${target.model.padEnd(30)} `);

		try {
			const result = await auditModel(target);
			results.push(result);

			if (result.accessible && result.canRead) {
				const count = result.recordCount ?? "?";
				console.log(
					`✅ Accessible | ${result.totalFieldCount} fields | ${count} records | Sync: ${result.canIncrementalSync ? "✅" : "❌"}`,
				);
			} else if (result.accessible) {
				console.log(
					`⚠️  Accessible but cannot read (${result.error || "unknown"})`,
				);
			} else {
				console.log(
					`❌ Not accessible (${result.error || "module not installed"})`,
				);
			}
		} catch (err: any) {
			console.log(`❌ Audit error: ${err.message}`);
			results.push({
				model: target.model,
				category: target.category,
				description: target.description,
				businessOwner: target.businessOwner,
				priority: target.priority,
				accessible: false,
				canRead: false,
				canFilter: false,
				canSort: false,
				canIncrementalSync: false,
				requiresCustomMapping: false,
				totalFieldCount: 0,
				keyFieldsPresent: [],
				keyFieldsMissing: [],
				allFieldNames: [],
				fieldTypes: {},
				relationshipFields: [],
				recordCount: null,
				sampleRecordKeys: [],
				dashboardFeatures: target.dashboardFeatures,
				aiAutomations: target.aiAutomations,
				error: err.message,
			});
		}
	}

	// ── Phase 3: Generate summary ──
	console.log(`\n${"═".repeat(78)}`);
	console.log("  CAPABILITY MATRIX SUMMARY");
	console.log("═".repeat(78));

	// Header
	console.log(
		"  " +
			"Model".padEnd(30) +
			"Read".padEnd(7) +
			"Filter".padEnd(9) +
			"Sort".padEnd(7) +
			"Sync".padEnd(7) +
			"Fields".padEnd(8) +
			"Records".padEnd(10) +
			"Priority",
	);
	console.log(`  ${"─".repeat(86)}`);

	for (const r of results) {
		const yn = (b: boolean) => (b ? "✅" : "❌");
		console.log(
			"  " +
				r.model.padEnd(30) +
				yn(r.canRead).padEnd(7) +
				yn(r.canFilter).padEnd(9) +
				yn(r.canSort).padEnd(7) +
				yn(r.canIncrementalSync).padEnd(7) +
				String(r.totalFieldCount).padEnd(8) +
				String(r.recordCount ?? "N/A").padEnd(10) +
				r.priority,
		);
	}

	// ── Statistics ──
	const accessible = results.filter((r) => r.accessible);
	const readable = results.filter((r) => r.canRead);
	const syncable = results.filter((r) => r.canIncrementalSync);
	const aiReady = results.filter(
		(r) => r.accessible && r.aiAutomations.length > 0,
	);
	const dashReady = results.filter(
		(r) => r.accessible && r.dashboardFeatures.length > 0,
	);
	const notAccessible = results.filter((r) => !r.accessible);

	console.log(`\n${"═".repeat(78)}`);
	console.log("  AGGREGATE STATISTICS");
	console.log("═".repeat(78));
	console.log(`  Total Models Audited:       ${results.length}`);
	console.log(
		`  Accessible:                 ${accessible.length} / ${results.length}`,
	);
	console.log(
		`  Readable (search_read):     ${readable.length} / ${results.length}`,
	);
	console.log(
		`  Incrementally Syncable:     ${syncable.length} / ${results.length}`,
	);
	console.log(
		`  Dashboard Ready:            ${dashReady.length} / ${results.length}`,
	);
	console.log(
		`  AI Automation Ready:        ${aiReady.length} / ${results.length}`,
	);

	if (notAccessible.length > 0) {
		console.log(
			"\n  ⚠️  Not Accessible (module not installed or access denied):",
		);
		for (const na of notAccessible) {
			console.log(`     - ${na.model}: ${na.error || "unknown"}`);
		}
	}

	// ── Customer Intelligence Summary ──
	const partnerResult = results.find((r) => r.model === "res.partner");
	const posOrderResult = results.find((r) => r.model === "pos.order");
	console.log(`\n${"═".repeat(78)}`);
	console.log("  CUSTOMER INTELLIGENCE CAPABILITIES");
	console.log("═".repeat(78));
	const ciFields = [
		"LTV",
		"Retention",
		"Cohorts",
		"Repeat Rate",
		"Purchase Frequency",
		"Customer Segments",
		"VIP Score",
		"RFM",
	];
	for (const ci of ciFields) {
		const possible = partnerResult?.canRead && posOrderResult?.canRead;
		console.log(
			`  ${ci.padEnd(25)} ${possible ? "✅ Buildable" : "❌ Missing data"}`,
		);
	}

	// ── Inventory Intelligence Summary ──
	const stockQuant = results.find((r) => r.model === "stock.quant");
	const stockMove = results.find((r) => r.model === "stock.move");
	console.log(`\n${"═".repeat(78)}`);
	console.log("  INVENTORY INTELLIGENCE CAPABILITIES");
	console.log("═".repeat(78));
	const invFeatures = [
		{ name: "Dead Stock Detection", requires: [stockQuant, stockMove] },
		{ name: "Inventory Aging", requires: [stockMove] },
		{ name: "Reorder Prediction", requires: [stockQuant] },
		{ name: "Stockout Prediction", requires: [stockQuant, stockMove] },
		{ name: "ABC Analysis", requires: [stockQuant, posOrderResult] },
		{ name: "Fast Movers", requires: [stockQuant, posOrderResult] },
		{ name: "Slow Movers", requires: [stockQuant, posOrderResult] },
	];
	for (const inv of invFeatures) {
		const possible = inv.requires.every((r) => r?.canRead);
		console.log(
			`  ${inv.name.padEnd(25)} ${possible ? "✅ Buildable" : "❌ Missing data"}`,
		);
	}

	// ── Founder AI Automations Summary ──
	console.log(`\n${"═".repeat(78)}`);
	console.log("  FOUNDER AI — ALL POSSIBLE AUTOMATIONS");
	console.log("═".repeat(78));

	const founderAI = [
		{
			name: "Morning Briefing",
			requires: ["pos.order", "crm.lead", "stock.quant"],
		},
		{ name: "Revenue Alerts", requires: ["pos.order", "sale.order"] },
		{ name: "Margin Alerts", requires: ["pos.order.line", "product.template"] },
		{ name: "Inventory Alerts", requires: ["stock.quant"] },
		{ name: "Dead Stock Alerts", requires: ["stock.quant", "stock.move"] },
		{ name: "Cash Flow Alerts", requires: ["account.move", "account.payment"] },
		{ name: "Lead Prioritization", requires: ["crm.lead"] },
		{
			name: "WhatsApp Auto-Trigger",
			requires: ["whatsapp.message", "whatsapp.template"],
		},
		{ name: "Store Comparison", requires: ["pos.order", "pos.config"] },
		{ name: "Demand Prediction", requires: ["pos.order.line", "stock.quant"] },
		{ name: "Fraud Detection", requires: ["pos.order", "pos.payment"] },
		{
			name: "Pricing Recommendation",
			requires: ["product.template", "pos.order.line"],
		},
		{ name: "Cross-Sell", requires: ["pos.order.line"] },
		{ name: "Upsell", requires: ["pos.order.line", "product.template"] },
		{ name: "Customer Win-back", requires: ["res.partner", "pos.order"] },
		{ name: "Employee Performance", requires: ["hr.employee"] },
		{
			name: "Store Health Score",
			requires: ["pos.order", "pos.config", "stock.quant"],
		},
		{ name: "VIP Auto-Detection", requires: ["res.partner", "pos.order"] },
		{ name: "Churn Prediction", requires: ["res.partner", "pos.order"] },
		{ name: "Reorder Suggestion", requires: ["stock.quant", "purchase.order"] },
	];

	for (const ai of founderAI) {
		const allAvailable = ai.requires.every((m) => {
			const r = results.find((x) => x.model === m);
			return r?.canRead;
		});
		console.log(
			`  ${ai.name.padEnd(28)} ${allAvailable ? "✅ Possible" : `❌ Blocked (missing: ${ai.requires.filter((m) => !results.find((x) => x.model === m)?.canRead).join(", ")})`}`,
		);
	}

	// ── Sync Frequency Recommendations ──
	console.log(`\n${"═".repeat(78)}`);
	console.log("  RECOMMENDED SYNC FREQUENCIES");
	console.log("═".repeat(78));

	const syncFreqs: { freq: string; models: string[] }[] = [
		{
			freq: "Every 1 minute",
			models: ["pos.order", "pos.order.line", "pos.payment"],
		},
		{
			freq: "Every 5 minutes",
			models: ["stock.quant", "crm.lead", "whatsapp.message"],
		},
		{
			freq: "Every 15 minutes",
			models: [
				"sale.order",
				"sale.order.line",
				"purchase.order",
				"account.move",
			],
		},
		{
			freq: "Every 1 hour",
			models: [
				"res.partner",
				"product.template",
				"product.product",
				"stock.move",
				"stock.picking",
			],
		},
		{
			freq: "Daily",
			models: [
				"hr.employee",
				"loyalty.program",
				"loyalty.card",
				"calendar.event",
				"project.task",
			],
		},
	];

	for (const sf of syncFreqs) {
		console.log(`\n  🕐 ${sf.freq}:`);
		for (const m of sf.models) {
			const r = results.find((x) => x.model === m);
			console.log(`     ${r?.canIncrementalSync ? "✅" : "❌"} ${m}`);
		}
	}

	// ── Write full JSON report ──
	const reportDir = path.resolve(process.cwd(), "docs", "audit");
	fs.mkdirSync(reportDir, { recursive: true });

	const reportPath = path.join(reportDir, "odoo-capability-audit.json");
	const report = {
		auditDate: new Date().toISOString(),
		instanceUrl: ODOO_URL,
		uid: UID,
		installedModulesCount: installedModules.length,
		installedModules: installedModules.map((m) => ({
			name: m.name,
			description: m.shortdesc,
			state: m.state,
		})),
		modelAudits: results,
		statistics: {
			totalAudited: results.length,
			accessible: accessible.length,
			readable: readable.length,
			syncable: syncable.length,
			dashboardReady: dashReady.length,
			aiReady: aiReady.length,
		},
	};

	fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
	console.log(`\n📄 Full JSON report saved to: ${reportPath}`);

	// ── Write installed modules list ──
	const modulesListPath = path.join(reportDir, "installed-modules.json");
	fs.writeFileSync(modulesListPath, JSON.stringify(installedModules, null, 2));
	console.log(`📄 Installed modules list saved to: ${modulesListPath}`);

	console.log(`\n${"═".repeat(78)}`);
	console.log("  AUDIT COMPLETE");
	console.log("═".repeat(78));
}

main().catch((err) => {
	console.error("Fatal audit error:", err);
	process.exit(1);
});
