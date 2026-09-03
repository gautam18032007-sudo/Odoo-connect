# ZenZebra Canonical Data Dictionary & Technical Contract v1.0

**Target System**: ZenZebra Sales CRM Platform & Retail Intelligence Engine  
**Source ERP**: Odoo 19.0 Enterprise SaaS (`https://zenzebra1.odoo.com`)  
**Database**: Neon PostgreSQL (Decoupled Canonical Layer)  
**Freeze Date**: July 31, 2026  

---

## 1. Master Identity & Business Rules (Phase 2.8 Empirical Frozen Truth)

### A. Store Identity & Physical Retail Mapping
- **Identity Source**: `pos.config` (`config_id`)
- **Store Mappings**:
  - `config_id = 1`: **ZenZebra** (Flagship Store, Code: `ZZ`)
  - `config_id = 2`: **KLJ** (KLJ Noida Store, Code: `KLJ`)
  - `config_id = 3`: **SWN** (Smartworks Noida Store, Code: `SWN`)
- **Rule**: Retail sales queries MUST filter and group by `pos.order.config_id`. Do NOT rely on `warehouse_id` or `company_id` for store grouping.

### B. Customer Identity & Guest Checkout Handling
- **Identity Source**: `res.partner` (`partner_id`)
- **Empirical Ground Truth**:
  - **Identified Customers**: POS transactions linked to `partner_id`.
  - **Guest Checkout**: POS transactions with `partner_id = NULL`.
- **Rule**: LTV, Retention, Cohort, and RFM calculations MUST exclude Guest Checkout (`partner_id IS NULL`) while Gross Revenue and AOV aggregations MUST include Guest Checkout.

### C. POS vs. Standard Sales Order Domain
- **Empirical Ground Truth**: Retail store operations are **100% powered by POS** (`pos.order`). `sale.order` has 0 records in retail operations.
- **Rule**: Retail store overview, sales dashboards, and inventory velocity MUST read from `pos.order` and `pos.order.line`.

### D. Returns, Refunds & Net Revenue Math
- **Empirical Ground Truth**: Refunds/returns in Odoo 19 POS are stored as `pos.order` records with **`amount_total < 0`** (e.g. `KLJ - 000278 REFUND`) and `state IN ('paid', 'done')`. Return line items have `qty < 0` and `price_subtotal < 0`.
- **Rule**: Net Revenue is calculated natively as `SUM(amount_total)`. No complex conditional subtraction logic is required.

### E. Archival & Delta Synchronization
- **Rule**: All sync queries querying Odoo models MUST include `['active', 'in', [True, False]]` to prevent skipping deactivated products or customers, and propagate `active = FALSE` to canonical tables.

---

## 2. Canonical Data Dictionary Matrix

| Dashboard Metric | Business Definition | Odoo 19 Model & Field | Transformation / Extraction Logic | Canonical Database Column | Consuming Dashboard Widgets | Dependent AI Automations |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Gross Revenue** | Total monetary value of all paid retail orders inclusive of refunds | `pos.order.amount_total` | `SUM(amount_total)` where `state IN ('paid', 'done')` | `fact_sales_orders.amount_total` | Store Overview, Sales KPI, Financial Briefing | Revenue Alerts, Store Health Score |
| **Net Collection** | Total gross revenue collected after tax | `pos.order.amount_total` | Direct sum of paid order totals | `fact_sales_orders.amount_total` | Executive KPI | Cash Flow Alerts |
| **GST Liability** | Total GST collected across sales | `pos.order.amount_tax` | `SUM(amount_tax)` where `state IN ('paid', 'done')` | `fact_sales_orders.amount_tax` | Tax & Compliance Report | Compliance Alerts |
| **Unit Selling Price** | Final retail selling price per item line | `pos.order.line.price_unit` | Direct line mapping | `fact_sales_lines.price_unit` | Product Mix, Price Analysis | Pricing Recommendations |
| **Line Discount (%)** | Discount percentage applied to line | `pos.order.line.discount` | Direct line percentage float | `fact_sales_lines.discount` | Discount Audit, Profitability | Margin Leak Alerts |
| **Net Line Total** | Line subtotal before tax after discount | `pos.order.line.price_subtotal` | Direct line subtotal float | `fact_sales_lines.price_subtotal` | Category Performance | Margin Engine |
| **Unit COGS / Cost** | Procurement/Standard cost price per product | `product.template.standard_price` | Direct mapping float | `dim_products.cost_price` | Profitability Matrix, Margin Analysis | Margin Alerts, Pricing Rec |
| **Retail List Price** | Standard catalog price | `product.template.list_price` | Direct mapping float | `dim_products.list_price` | Product Catalog | Discount Engine |
| **Gross Margin ($)** | Profit contribution per line | Derived | `price_subtotal - (qty * standard_price)` | Calculated SQL View | Profitability Dashboard | Margin Alerts |
| **Gross Margin (%)** | Profit margin percentage | Derived | `(Gross Margin / Net Line Total) * 100` | Calculated SQL View | Executive Summary | Pricing Optimizer |
| **On-Hand Stock** | Quantity currently physically present | `stock.quant.quantity` | `SUM(quantity)` grouped by product and location | `fact_inventory.quantity` | Stock Overview, Low Stock Table | Inventory Alerts, Stockout Prediction |
| **Free Stock (ATP)** | Unreserved stock available to promise | `product.product.free_qty` | Direct mapping float | `dim_products.free_qty` | Reorder Matrix | Auto PO Reorder Suggestion |
| **Bill Cuts (Orders)** | Count of distinct retail transactions | `pos.order.id` | `COUNT(DISTINCT id)` where `state IN ('paid', 'done')` | `fact_sales_orders.id` | Store Footfall/Orders Card | Demand Forecast |
| **AOV** | Average Order Value | Derived | `SUM(amount_total) / COUNT(DISTINCT id)` | Calculated SQL View | Sales Analytics | Store Performance Score |
| **Customer LTV** | Total historical spend by customer | `res.partner` + `pos.order` | `SUM(amount_total) GROUP BY partner_id` | Calculated View / `dim_customers` | Customer Intelligence | VIP Auto-Detection |
| **Customer Repeat Rate**| % of customers with > 1 order | Derived | `COUNT(partners with > 1 order) / Total Partners` | Customer Intelligence View | Cohort Analysis | Customer Win-back |

---

## 3. Canonical PostgreSQL Database DDL

```sql
-- ZenZebra Canonical Odoo Integration Schema v1.0

-- 1. Store Dimension Table (pos.config mapping)
CREATE TABLE IF NOT EXISTS dim_stores (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Product Dimension Table (product.product level)
CREATE TABLE IF NOT EXISTS dim_products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    default_code TEXT,
    barcode TEXT,
    list_price NUMERIC(12, 2) DEFAULT 0.00,
    cost_price NUMERIC(12, 2) DEFAULT 0.00,
    qty_available NUMERIC(12, 2) DEFAULT 0.00,
    free_qty NUMERIC(12, 2) DEFAULT 0.00,
    active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Customer Dimension Table (res.partner level)
CREATE TABLE IF NOT EXISTS dim_customers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    mobile TEXT,
    city TEXT,
    customer_rank INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Sales Orders Fact Table
CREATE TABLE IF NOT EXISTS fact_sales_orders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    date_order TIMESTAMP WITH TIME ZONE NOT NULL,
    partner_id INTEGER REFERENCES dim_customers(id) ON DELETE SET NULL,
    store_id INTEGER REFERENCES dim_stores(id) ON DELETE SET NULL,
    amount_total NUMERIC(12, 2) DEFAULT 0.00,
    amount_untaxed NUMERIC(12, 2) DEFAULT 0.00,
    amount_tax NUMERIC(12, 2) DEFAULT 0.00,
    state TEXT NOT NULL,
    order_type TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Sales Order Lines Fact Table
CREATE TABLE IF NOT EXISTS fact_sales_lines (
    id TEXT PRIMARY KEY,
    order_id TEXT REFERENCES fact_sales_orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES dim_products(id) ON DELETE RESTRICT,
    price_unit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    qty NUMERIC(12, 2) NOT NULL DEFAULT 1.00,
    price_subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Inventory Fact Table (stock.quant level snapshots)
CREATE TABLE IF NOT EXISTS fact_inventory (
    product_id INTEGER REFERENCES dim_products(id) ON DELETE CASCADE,
    location_id INTEGER NOT NULL,
    location_name TEXT,
    quantity NUMERIC(12, 2) DEFAULT 0.00,
    reserved_quantity NUMERIC(12, 2) DEFAULT 0.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (product_id, location_id)
);

-- 7. Sync Telemetry & Tracking Table
CREATE TABLE IF NOT EXISTS sync_telemetry (
    id SERIAL PRIMARY KEY,
    sync_type TEXT NOT NULL,
    records_processed INTEGER DEFAULT 0,
    status TEXT NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_dim_products_sku ON dim_products (default_code);
CREATE INDEX IF NOT EXISTS idx_dim_customers_mobile ON dim_customers (mobile);
CREATE INDEX IF NOT EXISTS idx_fact_sales_orders_date ON fact_sales_orders (date_order);
CREATE INDEX IF NOT EXISTS idx_fact_sales_orders_store ON fact_sales_orders (store_id);
CREATE INDEX IF NOT EXISTS idx_fact_sales_lines_product ON fact_sales_lines (product_id);
```
