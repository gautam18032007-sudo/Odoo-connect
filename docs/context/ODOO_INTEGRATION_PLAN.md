# Odoo → Zenzebra CRM: Real-Time Integration Plan

**Stack:** Next.js 16 · Neon PostgreSQL · Redis · TypeScript  
**Odoo Plan:** Standard (Cloud) — no external API; webhooks only

---

## Current vs Target Architecture

| | Before | After |
|---|---|---|
| Data Source | Manual Excel export from Odoo | Odoo pushes via webhook automatically |
| Trigger | Human uploads file | Odoo event (create/update) fires instantly |
| Latency | Hours to days | Seconds |
| Coverage | Sales only | Sales + CRM + Purchase + Inventory |
| Entry Point | `POST /api/sales/imports` | `POST /api/webhooks/odoo/[module]` |

---

## Flow Diagram

```
Odoo Standard (Cloud)
    │
    │  Webhook push (JSON)
    ▼
Make.com / Zapier  ──── maps + forwards ────►  /api/webhooks/odoo/sales
                                                /api/webhooks/odoo/crm
                                                /api/webhooks/odoo/purchase
                                                /api/webhooks/odoo/inventory
                                                    │
                                                    │  upsert
                                                    ▼
                                              Neon PostgreSQL
                                          sales_fact (existing)
                                          crm_leads (new)
                                          purchase_orders (new)
                                          inventory_snapshots (new)
                                          inventory_movements (new)
                                                    │
                                                    ▼
                                            Dashboard API Routes
                                    /api/sales/* /api/crm/* /api/purchase/* /api/inventory/*
```

---

## Why These Routes?

The auth middleware (`src/proxy.ts`) already whitelists `/api/webhooks` as a **public path** — no session cookie needed. This means:

```typescript
// src/proxy.ts — line 5
const publicPaths = [..., "/api/webhooks"];
```

Odoo/Make.com can POST directly without authentication friction.  
A shared secret (`x-webhook-secret` header + `ODOO_WEBHOOK_SECRET` env var) protects against unauthorized callers.

---

## Module-by-Module Breakdown

### 1. Sales — `/api/webhooks/odoo/sales`

**File created:** `src/app/api/webhooks/odoo/sales/route.ts`

**Odoo trigger:** Sales Order → On Confirmation (state = `sale`)

**Odoo fields → `sales_fact` columns:**

| Odoo Field | DB Column |
|---|---|
| `name` (SO0001) | `bill_no` |
| `date_order` | `sale_date` |
| `partner_id.name` | `customer_name` |
| `partner_id.phone` | `customer_mobile` |
| `warehouse_id.name` | `billed_by` (store) |
| `journal_id.name` | `payment_method` |
| `order_line.product_id.id` | `product_key` |
| `order_line.product_id.name` | `item_name` |
| `order_line.product_id.categ_id.name` | `category` |
| `order_line.price_unit` | `mrp_amount` |
| `order_line.product_uom_qty` | `quantity` |
| `order_line.price_subtotal` | `net_amount` |

The existing `store_alias_mapping` table normalises store names — same logic as the Excel import.  
**No schema changes needed** for `sales_fact`. This route replaces the manual upload.

---

### 2. CRM — `/api/webhooks/odoo/crm`

**File created:** `src/app/api/webhooks/odoo/crm/route.ts`

**Odoo trigger:** CRM Lead → On Creation, On Stage Change, On Win/Loss

**New table: `crm_leads`**

| Column | Type | Description |
|---|---|---|
| `odoo_lead_id` | INTEGER UNIQUE | Odoo record ID (conflict key) |
| `name` | TEXT | Deal/Lead name |
| `type` | TEXT | `lead` or `opportunity` |
| `stage` | TEXT | Pipeline stage name |
| `salesperson` | TEXT | Owner's name |
| `partner_name` | TEXT | Customer/Company |
| `email` / `phone` | TEXT | Contact details |
| `expected_revenue` | NUMERIC | Pipeline value |
| `probability` | NUMERIC | Win % |
| `date_deadline` | DATE | Expected closing |
| `source` / `medium` | TEXT | Lead attribution |
| `active` | BOOLEAN | Not lost |
| `won` | BOOLEAN | Won deal |

Use in CRM dashboard: pipeline view, win-rate, revenue forecast, conversion funnel.

---

### 3. Purchase — `/api/webhooks/odoo/purchase`

**File created:** `src/app/api/webhooks/odoo/purchase/route.ts`

**Odoo trigger:** Purchase Order → On Confirmation, On Receipt Validated

**New tables: `purchase_orders` + `purchase_order_lines`**

`purchase_orders` columns:
- `odoo_po_id` UNIQUE — conflict key for upserts
- `po_number`, `vendor_name`, `vendor_email`
- `order_date`, `scheduled_date`, `state`
- `amount_untaxed`, `amount_tax`, `amount_total`, `currency`

`purchase_order_lines` columns:
- `po_id` (FK to purchase_orders)
- `product_name`, `product_code`, `quantity`, `unit_price`, `subtotal`
- `qty_received`, `qty_billed` — for GRN tracking
- `scheduled_date`

Use cases: open PO value, vendor spend analysis, GRN vs billed reconciliation.

---

### 4. Inventory — `/api/webhooks/odoo/inventory`

**File created:** `src/app/api/webhooks/odoo/inventory/route.ts`

**Odoo triggers:**
- `stock.quant` → inventory adjustment → sends `event_type: "snapshot"` (current SOH per product/location)
- `stock.move` → validated delivery/receipt → sends `event_type: "movement"` (in/out events)

**New tables:**

`inventory_snapshots` — current stock on hand:
- `(odoo_product_id, location)` UNIQUE — always shows latest SOH
- `quantity`, `reserved_quantity`, `snapshot_at`

`inventory_movements` — immutable audit log:
- `odoo_move_id` UNIQUE — deduplication
- `move_type` (`in`/`out`), `from_location`, `to_location`
- `quantity_moved`, `moved_at`

Use cases: real-time SOH dashboard, stock-out alerts, inward/outward movement history.

---

## Make.com Setup (Step-by-Step)

### One Scenario per Odoo Module:

```
Odoo Trigger (Watch Records)
    ↓
Data Mapper (HTTP module)
    ↓
HTTP → Make an API Request
    URL: https://your-domain.com/api/webhooks/odoo/[module]
    Method: POST
    Headers:
      Content-Type: application/json
      x-webhook-secret: {{ODOO_WEBHOOK_SECRET}}
    Body: (mapped JSON from Odoo fields)
```

### Odoo Automation (alternative, no Make.com needed for simple cases):

In Odoo > Settings > Automation:
1. Model: `sale.order`
2. Trigger: On State Change → `sale`
3. Action: Send Webhook → paste `https://your-domain/api/webhooks/odoo/sales`

> Note: Odoo's native webhook sends its own JSON shape. Use Make.com to remap it to the payload schema this app expects.

---

## Environment Setup

Add to `.env.local`:

```env
ODOO_WEBHOOK_SECRET=your-strong-random-secret-here
```

Generate a secret:
```bash
openssl rand -hex 32
```

---

## Database Migration

Run once to create the new tables:

```bash
ts-node -P tsconfig.scripts.json src/scripts/migrate-odoo-webhook-tables.ts
```

Creates:
- `crm_leads`
- `purchase_orders`
- `purchase_order_lines`
- `inventory_snapshots`
- `inventory_movements`

---

## Files Created

| File | Purpose |
|---|---|
| `src/app/api/webhooks/odoo/sales/route.ts` | Receives Sales Orders → upserts `sales_fact` |
| `src/app/api/webhooks/odoo/crm/route.ts` | Receives CRM Leads → upserts `crm_leads` |
| `src/app/api/webhooks/odoo/purchase/route.ts` | Receives POs → upserts `purchase_orders` + lines |
| `src/app/api/webhooks/odoo/inventory/route.ts` | Receives SOH snapshots + stock moves |
| `src/scripts/migrate-odoo-webhook-tables.ts` | Creates the 4 new DB tables |

---

## Next Steps

1. **Run DB migration** → creates all new tables in Neon
2. **Add `ODOO_WEBHOOK_SECRET`** to `.env.local` (and your hosting env)
3. **Set up Make.com scenarios** — one per module, map Odoo fields to the payload schemas above
4. **Build dashboard API routes** for the new modules (same pattern as `/api/sales/*`)
5. **Add sidebar items** for CRM, Purchase, Inventory pages (sidebar-items.ts already has CRM and Finance placeholders)

---

## Payload Reference (for Make.com mapping)

### Sales Payload
```json
{
  "order_name": "S00042",
  "sale_date": "2024-06-15",
  "store_name": "SmartworksNoida Noida",
  "customer_name": "Ravi Kumar",
  "customer_mobile": "9876543210",
  "payment_method": "Cash",
  "lines": [
    {
      "product_key": "PROD-101",
      "sku_code": "SKU-WHITE-L",
      "item_name": "White Shirt L",
      "category": "Apparel",
      "brand": "Arrow",
      "quantity": 2,
      "mrp_amount": 1200,
      "discount_amount": 200,
      "gross_amount": 1000,
      "tax_amount": 50,
      "net_amount": 1050
    }
  ]
}
```

### CRM Payload
```json
{
  "odoo_lead_id": 42,
  "name": "Office furniture deal - Acme",
  "type": "opportunity",
  "stage": "Proposition",
  "salesperson": "Diwakar",
  "partner_name": "Acme Corp",
  "phone": "9876543210",
  "expected_revenue": 150000,
  "probability": 60,
  "date_deadline": "2024-07-15",
  "source": "Website",
  "active": true,
  "won": false,
  "created_at": "2024-06-01T10:00:00Z",
  "updated_at": "2024-06-15T14:30:00Z"
}
```

### Purchase Payload
```json
{
  "odoo_po_id": 15,
  "po_number": "PO/2024/0015",
  "vendor_name": "Supplier Ltd",
  "order_date": "2024-06-01",
  "scheduled_date": "2024-06-15",
  "state": "purchase",
  "amount_total": 59000,
  "currency": "INR",
  "lines": [
    {
      "product_name": "Office Chair",
      "product_code": "CHAIR-001",
      "quantity": 10,
      "unit_price": 5000,
      "subtotal": 50000,
      "qty_received": 5
    }
  ]
}
```

### Inventory Snapshot Payload
```json
{
  "event_type": "snapshot",
  "snapshot_at": "2024-06-15T10:00:00Z",
  "items": [
    {
      "product_id": 101,
      "product_name": "White Shirt L",
      "product_code": "SKU-001",
      "location": "WH/Stock",
      "quantity": 45,
      "reserved_quantity": 5
    }
  ]
}
```
