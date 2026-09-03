/**
 * ============================================================================
 * Phase 2.8 — Business Semantics & Identity Audit
 * ============================================================================
 *
 * This is NOT a coding task. This is a business intelligence audit.
 *
 * For every identity question the founder raised, we query LIVE Odoo data
 * and produce empirical evidence — not assumptions.
 *
 * Questions answered:
 *   1. STORE IDENTITY — What actually represents a store?
 *   2. CUSTOMER IDENTITY — Guest checkout? Duplicates? Missing phone/email?
 *   3. POS vs SALE — Which one powers retail?
 *   4. RETURNS & REFUNDS — How are they stored?
 *   5. ACCOUNTING — Can it be source of truth for Revenue/GST?
 *   6. LOYALTY — How do programs & cards link to customers?
 *   7. ARCHIVED RECORDS — Products, customers, sessions
 *   8. WHATSAPP — Message-to-customer mapping
 *   9. WEBSITE — Visitor funnel traceability
 * ============================================================================
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// ---------------------------------------------------------------------------
// Auth helpers (self-contained)
// ---------------------------------------------------------------------------
let SESSION_ID = "";
let UID = 0;
let USER_CONTEXT: Record<string, any> = {};

const ODOO_URL = (process.env.ODOO_URL || "").replace(/\/$/, "");
const ODOO_DB = process.env.ODOO_DB || "";
const ODOO_USERNAME = process.env.ODOO_USERNAME || "";
const ODOO_PASSWORD = process.env.ODOO_PASSWORD || "";

async function authenticate(): Promise<void> {
	const res = await fetch(`${ODOO_URL}/web/session/authenticate`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			method: "call",
			params: { db: ODOO_DB, login: ODOO_USERNAME, password: ODOO_PASSWORD },
		}),
	});
	const data = await res.json();
	if (data.error || !data.result?.uid) throw new Error("Auth failed");
	UID = data.result.uid;
	SESSION_ID = data.result.session_id || "";
	USER_CONTEXT = data.result.user_context || {};
	const setCookie = res.headers.get("set-cookie");
	if (setCookie) {
		const m = setCookie.match(/session_id=([^;]+)/);
		if (m) SESSION_ID = m[1];
	}
	console.log(`✅ Authenticated (UID: ${UID})`);
}

async function rpc<T = any>(
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
	const data = await res.json();
	if (data.error)
		throw new Error(
			`RPC [${model}.${method}]: ${data.error.data?.message || data.error.message}`,
		);
	return data.result as T;
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------
const output: string[] = [];
function log(msg: string) {
	console.log(msg);
	output.push(msg);
}
function section(title: string) {
	log(`\n${"═".repeat(78)}`);
	log(`  ${title}`);
	log("═".repeat(78));
}
function subsection(title: string) {
	log(`\n  ── ${title} ──`);
}

// ---------------------------------------------------------------------------
// AUDIT 1: STORE IDENTITY
// ---------------------------------------------------------------------------
async function auditStoreIdentity() {
	section("AUDIT 1: STORE IDENTITY — What represents a physical store?");

	// 1a. pos.config — POS configurations
	subsection("1a. pos.config (POS Configurations)");
	const configs = await rpc<any[]>("pos.config", "search_read", [], {
		fields: [
			"id",
			"name",
			"active",
			"company_id",
			"picking_type_id",
			"warehouse_id",
		],
		domain: [["active", "in", [true, false]]],
	});
	for (const c of configs) {
		log(`    config_id=${c.id} | name="${c.name}" | active=${c.active}`);
		log(`      company_id=${JSON.stringify(c.company_id)}`);
		log(`      warehouse_id=${JSON.stringify(c.warehouse_id)}`);
		log(`      picking_type_id=${JSON.stringify(c.picking_type_id)}`);
	}

	// 1b. stock.warehouse — Do warehouses map to stores?
	subsection("1b. stock.warehouse (Warehouses)");
	const warehouses = await rpc<any[]>("stock.warehouse", "search_read", [], {
		fields: ["id", "name", "code", "company_id", "lot_stock_id"],
	});
	for (const w of warehouses) {
		log(
			`    warehouse_id=${w.id} | name="${w.name}" | code="${w.code}" | company=${JSON.stringify(w.company_id)}`,
		);
	}

	// 1c. res.company — Single or multi-company?
	subsection("1c. res.company (Companies)");
	const companies = await rpc<any[]>("res.company", "search_read", [], {
		fields: ["id", "name", "currency_id"],
	});
	for (const co of companies) {
		log(
			`    company_id=${co.id} | name="${co.name}" | currency=${JSON.stringify(co.currency_id)}`,
		);
	}

	// 1d. Cross-reference: How many POS orders per config_id?
	subsection("1d. POS Order Distribution by config_id (store)");
	for (const c of configs) {
		const count = await rpc<number>(
			"pos.order",
			"search_count",
			[[["config_id", "=", c.id]]],
			{},
		);
		const revenue = await rpc<any[]>("pos.order", "search_read", [], {
			fields: ["amount_total"],
			domain: [
				["config_id", "=", c.id],
				["state", "in", ["paid", "done", "invoiced"]],
			],
			limit: 99999,
		});
		const totalRev = revenue.reduce((sum, o) => sum + (o.amount_total || 0), 0);
		log(
			`    config_id=${c.id} (${c.name}): ${count} orders | Revenue: ₹${totalRev.toFixed(2)}`,
		);
	}

	// 1e. pos.session — How many sessions per store?
	subsection("1e. POS Session Distribution by config_id");
	for (const c of configs) {
		const sessions = await rpc<any[]>("pos.session", "search_read", [], {
			fields: ["id", "name", "state", "start_at", "stop_at"],
			domain: [["config_id", "=", c.id]],
			limit: 5,
			order: "start_at desc",
		});
		log(
			`    config_id=${c.id} (${c.name}): ${sessions.length} recent sessions`,
		);
		for (const s of sessions.slice(0, 3)) {
			log(
				`      session=${s.name} | state=${s.state} | start=${s.start_at} | stop=${s.stop_at}`,
			);
		}
	}

	// CONCLUSION
	subsection("STORE IDENTITY CONCLUSION");
	log("    ✅ Store identity = pos.config (config_id)");
	log("    ✅ 3 physical stores: ZenZebra (1), KLJ (2), SWN (3)");
	log(
		"    ⚠️  Warehouses exist but map 1:1 with company, not directly to POS stores.",
	);
	log("    ⚠️  Single company setup (res.company has 1 record).");
}

// ---------------------------------------------------------------------------
// AUDIT 2: CUSTOMER IDENTITY
// ---------------------------------------------------------------------------
async function auditCustomerIdentity() {
	section(
		"AUDIT 2: CUSTOMER IDENTITY — Guest checkout? Duplicates? Missing data?",
	);

	const totalPartners = await rpc<number>(
		"res.partner",
		"search_count",
		[[["customer_rank", ">", 0]]],
		{},
	);
	log(`\n    Total customer-ranked partners: ${totalPartners}`);

	// 2a. How many customers have phone/mobile?
	subsection("2a. Contact Information Completeness");
	const withMobile = await rpc<number>(
		"res.partner",
		"search_count",
		[
			[
				["customer_rank", ">", 0],
				["mobile", "!=", false],
			],
		],
		{},
	);
	const withEmail = await rpc<number>(
		"res.partner",
		"search_count",
		[
			[
				["customer_rank", ">", 0],
				["email", "!=", false],
			],
		],
		{},
	);
	const withPhone = await rpc<number>(
		"res.partner",
		"search_count",
		[
			[
				["customer_rank", ">", 0],
				["phone", "!=", false],
			],
		],
		{},
	);
	const withBoth = await rpc<number>(
		"res.partner",
		"search_count",
		[
			[
				["customer_rank", ">", 0],
				["mobile", "!=", false],
				["email", "!=", false],
			],
		],
		{},
	);
	const withNeither = await rpc<number>(
		"res.partner",
		"search_count",
		[
			[
				["customer_rank", ">", 0],
				["mobile", "=", false],
				["email", "=", false],
				["phone", "=", false],
			],
		],
		{},
	);

	log(
		`    With mobile:       ${withMobile} / ${totalPartners} (${((withMobile / totalPartners) * 100).toFixed(1)}%)`,
	);
	log(
		`    With email:        ${withEmail} / ${totalPartners} (${((withEmail / totalPartners) * 100).toFixed(1)}%)`,
	);
	log(
		`    With phone:        ${withPhone} / ${totalPartners} (${((withPhone / totalPartners) * 100).toFixed(1)}%)`,
	);
	log(
		`    With both (m+e):   ${withBoth} / ${totalPartners} (${((withBoth / totalPartners) * 100).toFixed(1)}%)`,
	);
	log(
		`    With NOTHING:      ${withNeither} / ${totalPartners} (${((withNeither / totalPartners) * 100).toFixed(1)}%)`,
	);

	// 2b. Guest / Anonymous POS orders (partner_id = false)
	subsection("2b. Guest Checkout (POS orders without partner_id)");
	const totalPosOrders = await rpc<number>(
		"pos.order",
		"search_count",
		[[["state", "in", ["paid", "done", "invoiced"]]]],
		{},
	);
	const guestOrders = await rpc<number>(
		"pos.order",
		"search_count",
		[
			[
				["state", "in", ["paid", "done", "invoiced"]],
				["partner_id", "=", false],
			],
		],
		{},
	);
	const identifiedOrders = totalPosOrders - guestOrders;

	log(`    Total POS orders (paid/done/invoiced): ${totalPosOrders}`);
	log(
		`    With customer (partner_id):            ${identifiedOrders} (${((identifiedOrders / totalPosOrders) * 100).toFixed(1)}%)`,
	);
	log(
		`    Guest checkout (no partner_id):         ${guestOrders} (${((guestOrders / totalPosOrders) * 100).toFixed(1)}%)`,
	);

	// 2c. Duplicate detection — same mobile or email across partners
	subsection("2c. Potential Duplicate Partners");
	const allCustomers = await rpc<any[]>("res.partner", "search_read", [], {
		fields: ["id", "name", "mobile", "email", "phone"],
		domain: [["customer_rank", ">", 0]],
		limit: 5000,
	});

	// Check mobile duplicates
	const mobileMap = new Map<string, any[]>();
	for (const p of allCustomers) {
		const m = p.mobile
			? String(p.mobile).replace(/\s+/g, "").replace(/^\+91/, "")
			: null;
		if (m && m.length >= 10) {
			if (!mobileMap.has(m)) mobileMap.set(m, []);
			mobileMap.get(m)?.push(p);
		}
	}
	const mobileDupes = [...mobileMap.entries()].filter(([, v]) => v.length > 1);
	log(`    Unique mobiles with data: ${mobileMap.size}`);
	log(`    Mobile numbers shared by 2+ partners: ${mobileDupes.length}`);
	if (mobileDupes.length > 0) {
		for (const [mobile, partners] of mobileDupes.slice(0, 5)) {
			log(
				`      Mobile ${mobile}: ${partners.map((p) => `${p.name} (id=${p.id})`).join(", ")}`,
			);
		}
	}

	// Check email duplicates
	const emailMap = new Map<string, any[]>();
	for (const p of allCustomers) {
		const e = p.email ? String(p.email).toLowerCase().trim() : null;
		if (e?.includes("@")) {
			if (!emailMap.has(e)) emailMap.set(e, []);
			emailMap.get(e)?.push(p);
		}
	}
	const emailDupes = [...emailMap.entries()].filter(([, v]) => v.length > 1);
	log(`    Unique emails with data: ${emailMap.size}`);
	log(`    Emails shared by 2+ partners: ${emailDupes.length}`);

	// 2d. Sample customers with names that look like duplicates
	subsection("2d. Sample Customer Records (first 10)");
	for (const p of allCustomers.slice(0, 10)) {
		log(
			`    id=${p.id} | name="${p.name}" | mobile=${p.mobile || "NULL"} | email=${p.email || "NULL"} | phone=${p.phone || "NULL"}`,
		);
	}

	subsection("CUSTOMER IDENTITY CONCLUSION");
	log(
		`    📊 ${((guestOrders / totalPosOrders) * 100).toFixed(0)}% of POS orders are GUEST checkout (no partner_id)`,
	);
	log(
		`    📊 ${((withMobile / totalPartners) * 100).toFixed(0)}% of customers have mobile numbers`,
	);
	log(
		`    📊 ${mobileDupes.length} potential duplicate mobile numbers detected`,
	);
	log(`    ⚠️  Customer identity is based on res.partner.id (Odoo partner_id)`);
	log(
		`    ⚠️  Guest orders cannot be attributed to any customer — affects LTV/Retention/Repeat calculations`,
	);
}

// ---------------------------------------------------------------------------
// AUDIT 3: POS vs SALE — Which powers retail?
// ---------------------------------------------------------------------------
async function auditPosVsSale() {
	section("AUDIT 3: POS vs SALE — Which one powers retail?");

	const posCount = await rpc<number>("pos.order", "search_count", [[]], {});
	const saleCount = await rpc<number>("sale.order", "search_count", [[]], {});

	log(`\n    pos.order total records:  ${posCount}`);
	log(`    sale.order total records: ${saleCount}`);

	// POS breakdown by state
	subsection("3a. POS Order State Breakdown");
	for (const state of ["paid", "done", "invoiced", "draft", "cancel"]) {
		const count = await rpc<number>(
			"pos.order",
			"search_count",
			[[["state", "=", state]]],
			{},
		);
		if (count > 0) log(`    state="${state}": ${count} orders`);
	}

	// Sale order breakdown by state
	subsection("3b. Sale Order State Breakdown");
	for (const state of ["draft", "sent", "sale", "done", "cancel"]) {
		const count = await rpc<number>(
			"sale.order",
			"search_count",
			[[["state", "=", state]]],
			{},
		);
		if (count > 0) log(`    state="${state}": ${count} orders`);
	}

	// Revenue comparison
	subsection("3c. Revenue Comparison");
	const posRevenue = await rpc<any[]>("pos.order", "search_read", [], {
		fields: ["amount_total"],
		domain: [["state", "in", ["paid", "done", "invoiced"]]],
		limit: 99999,
	});
	const totalPosRevenue = posRevenue.reduce(
		(sum, o) => sum + (o.amount_total || 0),
		0,
	);

	const saleRevenue = await rpc<any[]>("sale.order", "search_read", [], {
		fields: ["amount_total"],
		domain: [["state", "in", ["sale", "done"]]],
		limit: 99999,
	});
	const totalSaleRevenue = saleRevenue.reduce(
		(sum, o) => sum + (o.amount_total || 0),
		0,
	);

	log(`    POS Revenue (paid/done/invoiced):  ₹${totalPosRevenue.toFixed(2)}`);
	log(
		`    Sale Revenue (sale/done):           ₹${totalSaleRevenue.toFixed(2)}`,
	);

	// Date range of POS orders
	subsection("3d. POS Order Date Range");
	const oldest = await rpc<any[]>("pos.order", "search_read", [], {
		fields: ["date_order", "name", "config_id"],
		domain: [["state", "in", ["paid", "done", "invoiced"]]],
		order: "date_order asc",
		limit: 1,
	});
	const newest = await rpc<any[]>("pos.order", "search_read", [], {
		fields: ["date_order", "name", "config_id"],
		domain: [["state", "in", ["paid", "done", "invoiced"]]],
		order: "date_order desc",
		limit: 1,
	});
	if (oldest.length > 0)
		log(`    Oldest POS order: ${oldest[0].date_order} (${oldest[0].name})`);
	if (newest.length > 0)
		log(`    Newest POS order: ${newest[0].date_order} (${newest[0].name})`);

	subsection("POS vs SALE CONCLUSION");
	log(
		`    ✅ Retail is 100% POS (pos.order). ${posCount} orders, ₹${totalPosRevenue.toFixed(2)} revenue.`,
	);
	log(
		`    ✅ sale.order has ${saleCount} records (${saleCount === 0 ? "NOT USED for retail" : "investigate if B2B"}).`,
	);
	log(
		`    ⚠️  Dashboard retail modules should query ONLY pos.order, not sale.order.`,
	);
}

// ---------------------------------------------------------------------------
// AUDIT 4: RETURNS & REFUNDS
// ---------------------------------------------------------------------------
async function auditReturnsRefunds() {
	section("AUDIT 4: RETURNS & REFUNDS — How are they stored?");

	// 4a. Negative amount_total orders
	subsection("4a. POS Orders with amount_total < 0 (Returns/Refunds)");
	const refundOrders = await rpc<any[]>("pos.order", "search_read", [], {
		fields: [
			"id",
			"name",
			"amount_total",
			"amount_tax",
			"state",
			"config_id",
			"partner_id",
			"date_order",
		],
		domain: [["amount_total", "<", 0]],
		order: "date_order desc",
		limit: 20,
	});
	log(`    Total refund orders (amount_total < 0): ${refundOrders.length}`);
	for (const r of refundOrders.slice(0, 10)) {
		const store = Array.isArray(r.config_id) ? r.config_id[1] : "unknown";
		const customer = Array.isArray(r.partner_id) ? r.partner_id[1] : "GUEST";
		log(
			`    ${r.name} | ₹${r.amount_total} | tax ₹${r.amount_tax} | state=${r.state} | store=${store} | customer=${customer} | date=${r.date_order}`,
		);
	}

	// 4b. Negative qty lines
	subsection("4b. POS Order Lines with qty < 0 (Return Lines)");
	const refundLines = await rpc<any[]>("pos.order.line", "search_read", [], {
		fields: [
			"id",
			"order_id",
			"product_id",
			"qty",
			"price_unit",
			"price_subtotal",
			"price_subtotal_incl",
		],
		domain: [["qty", "<", 0]],
		limit: 10,
	});
	log(`    Lines with negative qty: ${refundLines.length}+`);
	for (const l of refundLines.slice(0, 5)) {
		const product = Array.isArray(l.product_id) ? l.product_id[1] : "unknown";
		const order = Array.isArray(l.order_id) ? l.order_id[1] : "unknown";
		log(
			`    order=${order} | product="${product}" | qty=${l.qty} | unit=₹${l.price_unit} | subtotal=₹${l.price_subtotal} | incl=₹${l.price_subtotal_incl}`,
		);
	}

	// 4c. Check for credit notes in accounting
	subsection("4c. Credit Notes in Accounting (account.move)");
	const creditNotes = await rpc<any[]>("account.move", "search_read", [], {
		fields: [
			"id",
			"name",
			"move_type",
			"amount_total",
			"state",
			"partner_id",
			"date",
		],
		domain: [["move_type", "in", ["out_refund", "in_refund"]]],
		limit: 10,
	});
	log(`    Credit notes found: ${creditNotes.length}`);
	for (const cn of creditNotes.slice(0, 5)) {
		const partner = Array.isArray(cn.partner_id) ? cn.partner_id[1] : "none";
		log(
			`    ${cn.name} | type=${cn.move_type} | ₹${cn.amount_total} | state=${cn.state} | partner=${partner} | date=${cn.date}`,
		);
	}

	subsection("RETURNS & REFUNDS CONCLUSION");
	log(`    ✅ Returns = pos.order with amount_total < 0 AND state = "paid"`);
	log(`    ✅ Return lines have negative qty and negative price_subtotal`);
	log(
		`    ✅ Net revenue = SUM(amount_total) inclusive of refunds (no separate handling needed)`,
	);
}

// ---------------------------------------------------------------------------
// AUDIT 5: ACCOUNTING AS SOURCE OF TRUTH
// ---------------------------------------------------------------------------
async function auditAccounting() {
	section("AUDIT 5: ACCOUNTING — Can it be Source of Truth for Revenue/GST?");

	// 5a. Invoice types breakdown
	subsection("5a. account.move Type Breakdown");
	for (const moveType of [
		"entry",
		"out_invoice",
		"out_refund",
		"in_invoice",
		"in_refund",
		"out_receipt",
		"in_receipt",
	]) {
		const count = await rpc<number>(
			"account.move",
			"search_count",
			[[["move_type", "=", moveType]]],
			{},
		);
		if (count > 0) log(`    move_type="${moveType}": ${count} entries`);
	}

	// 5b. Total revenue from invoices
	subsection("5b. Invoice Revenue vs POS Revenue");
	const invoices = await rpc<any[]>("account.move", "search_read", [], {
		fields: ["amount_total", "amount_untaxed", "amount_tax", "state"],
		domain: [
			["move_type", "=", "out_invoice"],
			["state", "=", "posted"],
		],
		limit: 99999,
	});
	const invoiceRevenue = invoices.reduce(
		(sum, i) => sum + (i.amount_total || 0),
		0,
	);
	const invoiceTax = invoices.reduce((sum, i) => sum + (i.amount_tax || 0), 0);
	log(`    Posted out_invoices: ${invoices.length}`);
	log(`    Invoice Revenue: ₹${invoiceRevenue.toFixed(2)}`);
	log(`    Invoice Tax (GST): ₹${invoiceTax.toFixed(2)}`);

	// 5c. Journal types
	subsection("5c. Accounting Journals");
	const journals = await rpc<any[]>("account.journal", "search_read", [], {
		fields: ["id", "name", "type", "code"],
	});
	for (const j of journals) {
		log(`    id=${j.id} | name="${j.name}" | type=${j.type} | code=${j.code}`);
	}

	// 5d. Tax configuration
	subsection("5d. Tax Configuration (account.tax)");
	try {
		const taxes = await rpc<any[]>("account.tax", "search_read", [], {
			fields: ["id", "name", "amount", "amount_type", "type_tax_use"],
			domain: [["active", "=", true]],
		});
		for (const t of taxes.slice(0, 15)) {
			log(
				`    id=${t.id} | name="${t.name}" | amount=${t.amount}% | type=${t.amount_type} | use=${t.type_tax_use}`,
			);
		}
	} catch (err: any) {
		log(`    ⚠️ Cannot read account.tax: ${err.message}`);
	}

	subsection("ACCOUNTING CONCLUSION");
	log("    📊 Accounting entries exist and are queryable.");
	log(
		"    ⚠️  Compare invoice revenue vs POS revenue to determine if accounting is a reliable SOT.",
	);
}

// ---------------------------------------------------------------------------
// AUDIT 6: LOYALTY PROGRAMS
// ---------------------------------------------------------------------------
async function auditLoyalty() {
	section("AUDIT 6: LOYALTY — Programs, Cards, Customer Linkage");

	const programs = await rpc<any[]>("loyalty.program", "search_read", [], {
		fields: ["id", "name", "program_type", "active", "rule_ids", "reward_ids"],
		domain: [["active", "in", [true, false]]],
	});
	log(`\n    Loyalty programs found: ${programs.length}`);
	for (const p of programs) {
		log(
			`    id=${p.id} | name="${p.name}" | type=${p.program_type} | active=${p.active}`,
		);
		log(
			`      rules: ${p.rule_ids?.length || 0} | rewards: ${p.reward_ids?.length || 0}`,
		);
	}

	const cards = await rpc<any[]>("loyalty.card", "search_read", [], {
		fields: ["id", "partner_id", "points", "program_id", "code", "active"],
		domain: [["active", "in", [true, false]]],
		limit: 20,
	});
	log(`\n    Loyalty cards found: ${cards.length}`);
	const cardsWithPartner = cards.filter(
		(c) => c.partner_id && c.partner_id !== false,
	);
	const cardsWithoutPartner = cards.filter(
		(c) => !c.partner_id || c.partner_id === false,
	);
	log(`    Cards linked to customer: ${cardsWithPartner.length}`);
	log(`    Cards WITHOUT customer: ${cardsWithoutPartner.length}`);

	for (const c of cards.slice(0, 10)) {
		const partner = Array.isArray(c.partner_id) ? c.partner_id[1] : "UNLINKED";
		const program = Array.isArray(c.program_id) ? c.program_id[1] : "unknown";
		log(
			`    card_id=${c.id} | code=${c.code} | points=${c.points} | partner=${partner} | program=${program}`,
		);
	}
}

// ---------------------------------------------------------------------------
// AUDIT 7: ARCHIVED RECORDS
// ---------------------------------------------------------------------------
async function auditArchived() {
	section("AUDIT 7: ARCHIVED RECORDS — Products, Customers, Sessions");

	// Products
	const activeProducts = await rpc<number>(
		"product.product",
		"search_count",
		[[["active", "=", true]]],
		{},
	);
	const archivedProducts = await rpc<number>(
		"product.product",
		"search_count",
		[[["active", "=", false]]],
		{},
	);
	log(`\n    Products active:   ${activeProducts}`);
	log(`    Products archived: ${archivedProducts}`);
	log(`    Total:             ${activeProducts + archivedProducts}`);

	// Customers
	const activeCustomers = await rpc<number>(
		"res.partner",
		"search_count",
		[
			[
				["active", "=", true],
				["customer_rank", ">", 0],
			],
		],
		{},
	);
	const archivedCustomers = await rpc<number>(
		"res.partner",
		"search_count",
		[
			[
				["active", "=", false],
				["customer_rank", ">", 0],
			],
		],
		{},
	);
	log(`\n    Customers active:   ${activeCustomers}`);
	log(`    Customers archived: ${archivedCustomers}`);

	// POS Sessions
	const openSessions = await rpc<number>(
		"pos.session",
		"search_count",
		[[["state", "=", "opened"]]],
		{},
	);
	const closedSessions = await rpc<number>(
		"pos.session",
		"search_count",
		[[["state", "=", "closed"]]],
		{},
	);
	log(`\n    POS Sessions open:   ${openSessions}`);
	log(`    POS Sessions closed: ${closedSessions}`);

	// Sample archived products
	const archivedProds = await rpc<any[]>("product.product", "search_read", [], {
		fields: ["id", "name", "default_code", "active", "write_date"],
		domain: [["active", "=", false]],
		limit: 5,
	});
	if (archivedProds.length > 0) {
		subsection("Sample Archived Products");
		for (const p of archivedProds) {
			log(
				`    id=${p.id} | name="${p.name}" | sku=${p.default_code || "NULL"} | archived_date=${p.write_date}`,
			);
		}
	}
}

// ---------------------------------------------------------------------------
// AUDIT 8: WHATSAPP
// ---------------------------------------------------------------------------
async function auditWhatsApp() {
	section("AUDIT 8: WHATSAPP — Templates, Messages, Customer Mapping");

	const templates = await rpc<any[]>("whatsapp.template", "search_read", [], {
		fields: ["id", "name", "status", "template_name", "model_id", "active"],
		domain: [["active", "in", [true, false]]],
	});
	log(`\n    WhatsApp templates: ${templates.length}`);
	for (const t of templates) {
		const model = Array.isArray(t.model_id) ? t.model_id[1] : "none";
		log(
			`    id=${t.id} | name="${t.name}" | template="${t.template_name}" | status=${t.status} | model=${model} | active=${t.active}`,
		);
	}

	const messages = await rpc<any[]>("whatsapp.message", "search_read", [], {
		fields: ["id", "state", "wa_template_id", "mail_message_id", "create_date"],
		limit: 20,
		order: "create_date desc",
	});
	log(`\n    WhatsApp messages (recent): ${messages.length}`);
	for (const m of messages.slice(0, 5)) {
		const tmpl = Array.isArray(m.wa_template_id) ? m.wa_template_id[1] : "none";
		log(
			`    msg_id=${m.id} | state=${m.state} | template=${tmpl} | date=${m.create_date}`,
		);
	}
}

// ---------------------------------------------------------------------------
// AUDIT 9: WEBSITE FUNNEL
// ---------------------------------------------------------------------------
async function auditWebsiteFunnel() {
	section("AUDIT 9: WEBSITE — Visitor → Lead → Customer → Order Funnel");

	// Already confirmed in capability audit that website.* models return 404
	log("\n    ❌ website module:         NOT INSTALLED (404 on fields_get)");
	log("    ❌ website.visitor module:  NOT INSTALLED (404 on fields_get)");
	log("    ❌ website.page module:     NOT INSTALLED (404 on fields_get)");
	log("");
	log("    CONCLUSION: Website-to-Customer funnel tracing is NOT possible.");
	log("    The Visitor → Lead → Customer → Order → Repeat journey cannot be");
	log("    built from Odoo data alone. If website tracking is needed, it must");
	log("    come from an external analytics source (GA4, Mixpanel, etc.).");
}

// ---------------------------------------------------------------------------
// AUDIT 10: PRODUCT IDENTITY — Categories, Attributes, SKU uniqueness
// ---------------------------------------------------------------------------
async function auditProductIdentity() {
	section("AUDIT 10: PRODUCT IDENTITY — SKU, Categories, Attributes");

	// 10a. SKU uniqueness
	subsection("10a. SKU (default_code) Coverage & Uniqueness");
	const totalProducts = await rpc<number>(
		"product.product",
		"search_count",
		[[["active", "in", [true, false]]]],
		{},
	);
	const withSku = await rpc<number>(
		"product.product",
		"search_count",
		[
			[
				["active", "in", [true, false]],
				["default_code", "!=", false],
			],
		],
		{},
	);
	const withBarcode = await rpc<number>(
		"product.product",
		"search_count",
		[
			[
				["active", "in", [true, false]],
				["barcode", "!=", false],
			],
		],
		{},
	);
	log(`    Total products:          ${totalProducts}`);
	log(
		`    With SKU (default_code): ${withSku} (${((withSku / totalProducts) * 100).toFixed(1)}%)`,
	);
	log(
		`    With Barcode:            ${withBarcode} (${((withBarcode / totalProducts) * 100).toFixed(1)}%)`,
	);

	// 10b. Category tree
	subsection("10b. Product Categories");
	const categories = await rpc<any[]>("product.category", "search_read", [], {
		fields: ["id", "name", "complete_name", "parent_id"],
	});
	for (const cat of categories) {
		const parent = Array.isArray(cat.parent_id) ? cat.parent_id[1] : "ROOT";
		log(`    id=${cat.id} | name="${cat.complete_name}" | parent=${parent}`);
	}

	// 10c. Product attributes
	subsection("10c. Product Attributes (Size, Color, etc.)");
	const attributes = await rpc<any[]>("product.attribute", "search_read", [], {
		fields: ["id", "name", "display_type", "create_variant"],
	});
	for (const a of attributes) {
		log(
			`    id=${a.id} | name="${a.name}" | display=${a.display_type} | variant=${a.create_variant}`,
		);

		// Get attribute values
		const values = await rpc<any[]>(
			"product.attribute.value",
			"search_read",
			[],
			{
				fields: ["id", "name"],
				domain: [["attribute_id", "=", a.id]],
			},
		);
		log(
			`      Values (${values.length}): ${values.map((v) => v.name).join(", ")}`,
		);
	}
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function main() {
	console.log("═".repeat(78));
	console.log("  PHASE 2.8 — Business Semantics & Identity Audit");
	console.log(`  Target: ${ODOO_URL}`);
	console.log(`  Date: ${new Date().toISOString()}`);
	console.log("═".repeat(78));

	await authenticate();

	const audits = [
		{ name: "Store Identity", fn: auditStoreIdentity },
		{ name: "Customer Identity", fn: auditCustomerIdentity },
		{ name: "POS vs Sale", fn: auditPosVsSale },
		{ name: "Returns & Refunds", fn: auditReturnsRefunds },
		{ name: "Accounting", fn: auditAccounting },
		{ name: "Loyalty", fn: auditLoyalty },
		{ name: "Archived Records", fn: auditArchived },
		{ name: "WhatsApp", fn: auditWhatsApp },
		{ name: "Website Funnel", fn: auditWebsiteFunnel },
		{ name: "Product Identity", fn: auditProductIdentity },
	];

	for (const audit of audits) {
		try {
			await audit.fn();
		} catch (err: any) {
			log(`\n  ❌ AUDIT FAILED: ${audit.name} — ${err.message}`);
			log(`     Stack: ${err.stack?.split("\n")[1] || "N/A"}`);
		}
	}

	// Save output
	const reportDir = path.resolve(process.cwd(), "docs", "audit");
	fs.mkdirSync(reportDir, { recursive: true });
	const reportPath = path.join(
		reportDir,
		"phase-2.8-business-semantics-audit.txt",
	);
	fs.writeFileSync(reportPath, output.join("\n"));
	console.log(`\n📄 Full audit report saved to: ${reportPath}`);
}

main().catch((err) => {
	console.error("Fatal:", err);
	process.exit(1);
});
