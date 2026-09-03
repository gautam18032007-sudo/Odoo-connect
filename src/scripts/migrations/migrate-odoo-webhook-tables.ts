import path from "node:path";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function migrate() {
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL in environment.");
		process.exit(1);
	}

	console.log("Connecting to Neon PostgreSQL...");
	const sql = neon(process.env.DATABASE_URL);

	console.log("1. Creating crm_leads table...");
	await sql`
		CREATE TABLE IF NOT EXISTS crm_leads (
			id SERIAL PRIMARY KEY,
			odoo_lead_id INTEGER UNIQUE,
			name TEXT NOT NULL,
			type TEXT NOT NULL DEFAULT 'opportunity',
			stage TEXT NOT NULL DEFAULT 'Qualified',
			salesperson TEXT,
			partner_name TEXT,
			email TEXT,
			phone TEXT,
			expected_revenue NUMERIC(12, 2) DEFAULT 0,
			probability NUMERIC(5, 2) DEFAULT 0,
			date_deadline DATE,
			source TEXT,
			medium TEXT,
			active BOOLEAN DEFAULT TRUE,
			won BOOLEAN DEFAULT FALSE,
			store TEXT DEFAULT 'KLJ',
			health TEXT DEFAULT 'On Track',
			notes TEXT,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
	`;

	console.log("2. Creating purchase_orders table...");
	await sql`
		CREATE TABLE IF NOT EXISTS purchase_orders (
			id SERIAL PRIMARY KEY,
			odoo_po_id INTEGER UNIQUE,
			po_number TEXT NOT NULL,
			vendor_name TEXT NOT NULL,
			vendor_email TEXT,
			order_date DATE NOT NULL,
			scheduled_date DATE,
			state TEXT NOT NULL DEFAULT 'draft',
			amount_untaxed NUMERIC(12, 2) DEFAULT 0,
			amount_tax NUMERIC(12, 2) DEFAULT 0,
			amount_total NUMERIC(12, 2) DEFAULT 0,
			currency TEXT DEFAULT 'INR',
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
	`;

	console.log("3. Creating purchase_order_lines table...");
	await sql`
		CREATE TABLE IF NOT EXISTS purchase_order_lines (
			id SERIAL PRIMARY KEY,
			po_id INTEGER REFERENCES purchase_orders(id) ON DELETE CASCADE,
			product_name TEXT NOT NULL,
			product_code TEXT,
			quantity INTEGER NOT NULL DEFAULT 1,
			unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
			subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
			qty_received INTEGER DEFAULT 0,
			qty_billed INTEGER DEFAULT 0,
			scheduled_date DATE,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
	`;

	console.log("4. Creating inventory_snapshots table...");
	await sql`
		CREATE TABLE IF NOT EXISTS inventory_snapshots (
			id SERIAL PRIMARY KEY,
			odoo_product_id INTEGER NOT NULL,
			product_name TEXT NOT NULL,
			product_code TEXT,
			location TEXT NOT NULL,
			quantity INTEGER NOT NULL DEFAULT 0,
			reserved_quantity INTEGER NOT NULL DEFAULT 0,
			snapshot_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(odoo_product_id, location)
		);
	`;

	console.log("5. Creating inventory_movements table...");
	await sql`
		CREATE TABLE IF NOT EXISTS inventory_movements (
			id SERIAL PRIMARY KEY,
			odoo_move_id INTEGER UNIQUE,
			product_name TEXT NOT NULL,
			move_type TEXT NOT NULL,
			from_location TEXT,
			to_location TEXT,
			quantity_moved INTEGER NOT NULL,
			moved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
	`;

	console.log("6. Creating indexes for CRM, PO, and Inventory...");
	await sql`CREATE INDEX IF NOT EXISTS idx_crm_leads_stage ON crm_leads (stage);`;
	await sql`CREATE INDEX IF NOT EXISTS idx_crm_leads_salesperson ON crm_leads (salesperson);`;
	await sql`CREATE INDEX IF NOT EXISTS idx_crm_leads_active ON crm_leads (active);`;
	await sql`CREATE INDEX IF NOT EXISTS idx_purchase_orders_state ON purchase_orders (state);`;
	await sql`CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor ON purchase_orders (vendor_name);`;
	await sql`CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_product ON inventory_snapshots (odoo_product_id);`;

	console.log("✅ All webhook & pipeline tables successfully migrated!");
}

migrate().catch((err) => {
	console.error("❌ Migration failed:", err);
	process.exit(1);
});
