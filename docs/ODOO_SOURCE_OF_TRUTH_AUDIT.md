# Odoo Source-of-Truth Audit — Phase 0

**Status:** Read-only forensic audit. No code or database mutations were made to produce this document.
**Scope:** Consolidates direct verification performed against the live Odoo instance (`https://zenzebra1.odoo.com`) and the live NEW Neon database (`ep-broad-boat-ae6idn0b-pooler.../neondb`) across an extended audit/repair session. Two prior repairs are already deployed and verified (see §J): dynamic store attribution in `sales_fact_v`, and data-driven NEW STORE logic in `store-performance.ts`.

---

## A. Odoo models currently used by the sync layer

Confirmed via reading `src/lib/odoo/sync/syncSales.ts` and `src/lib/odoo/sync/syncInventory.ts`:

- `pos.config` — queried to derive store name/location (fields consumed: `id`, `name`, `picking_type_id`; **`id` itself is discarded, not persisted**)
- `stock.picking.type` — queried only to resolve `default_location_src_id` for the store's inventory location
- `pos.order` — order header sync
- `pos.order.line` — line-item sync (fields: `id`, `order_id`, `product_id`, `price_unit`, `discount`, `qty`, `price_subtotal`, `price_subtotal_incl`)
- `sale.order` / `sale.order.line` — a second, parallel sync path for non-POS sales orders (less exercised in current data — nearly all volume is POS)
- `stock.quant` — inventory sync (fields: `product_id`, `location_id`, `quantity`, `reserved_quantity`)
- `product.product` (implied — `fetchAndUpsertMissingProducts` auto-recovers products referenced by sales lines but not yet in `dim_products`)

## B. Odoo models confirmed to exist and hold real data, but currently NOT synced at all

Verified via direct live Odoo queries this session:

- **`res.company`** — 3 companies exist. Only `ZenZebra` (id 1) has `vat` populated (`07AAMCB2083P1Z5`, state `Delhi`). `Zenzebra Noida` (id 2) and `ZenZebra Haryana` (id 3) have `vat: false` — **this is genuinely incomplete data in Odoo itself, not a sync gap.**
- **`account.tax`** — real per-company GST/CESS/exemption tax records exist (e.g. `5% GST S`, `1.591% CESS S`, `0% Exempt`), all scoped to `company_id=1`.
- **`stock.location`** (internal usage) — 5 locations exist: `HO/Stock` (id 5), `HQ27/Stock` (id 3757), `HQ27GGN/Stock` (id 3739), `KLJ/Stock` (id 14), `SWN/Stock` (id 20). **Open question, unresolved (§K):** our `dim_stores` maps `HQ27GGN` to location 3757 (`HQ27/Stock`), not 3739 (`HQ27GGN/Stock`) — which one is actually correct for this store has not been determined from Odoo's relational data.
- **`product.category`** — 11 categories exist, including **two visually-identical but distinct records**: `"Beverages"` (id 25) and `"Beverages "` (id 19, trailing space). `"Clothing "` and `"Live menu "` also carry trailing whitespace. These are separate Odoo IDs, not duplicates to silently merge.
- **`pos.config`** itself, as an entity — 4 records (`ZenZebra`=1, `KLJ`=2, `SWN`=3, `HQ27GGN`=4), each carrying `company_id` and a distinct `picking_type_id`. Queried during sync but never persisted as a dimension.

## C. Fields extracted from Odoo per model (as currently coded)

| Model | Fields extracted | Fields available but discarded |
|---|---|---|
| `pos.config` | `id` (used transiently), `name`, `picking_type_id` | `company_id` (not persisted onto `dim_stores`) |
| `pos.order` | id, name, date_order, partner_id, config_id, amount_total, amount_tax, state | `pos_config_id` is read to derive `store_id` but not retained as its own column |
| `pos.order.line` | id, order_id, product_id, price_unit, discount, qty, price_subtotal, price_subtotal_incl | tax line detail beyond the flat `tax_amount` derived field |
| `res.company` | *(none — not queried at all)* | id, name, vat, state_id, country_id |
| `account.tax` | *(none — not queried at all)* | id, name, amount, type_tax_use, company_id |
| `stock.location` | `default_location_src_id` only, via `stock.picking.type` | full location metadata, hierarchy |
| `product.category` | category name string only (via `dim_products.category`) | category `id`, `parent_id` |

## D. Canonical DB tables relevant to this scope (34-table schema, confirmed via `information_schema`)

`dim_stores` (id, name, code, location_id, updated_at — **no company/GST/POS columns**), `dim_products` (includes `category` as a free-text string, not an FK), `dim_customers`, `fact_sales_orders` (`store_id` FK to `dim_stores.id`, confirmed 100% resolved, zero orphans — **no `pos_config_id` column**), `fact_sales_lines` (no store column of its own — inherits via `order_id → fact_sales_orders.store_id`), `fact_inventory`, `sales_fact` (legacy Excel, 0 rows on this database), `sales_fact_v` (compatibility view, repaired this session — see §J).

**No `dim_companies`, `dim_pos_configs`, `dim_gst_registrations`, or `dim_taxes` table exists.**

## E. Odoo → DB mapping (as it stands today)

```
pos.config.name           → dim_stores.name
pos.config → picking_type → stock.location (default_location_src_id) → dim_stores.location_id
(no source)                → dim_stores.code (falls back to literal 'STORE' when name
                              doesn't match a hardcoded zenzebra/klj/smartworks check)
pos.order.config_id       → fact_sales_orders.store_id (via dim_stores lookup)
pos.order.line.*          → fact_sales_lines.* (direct field mapping)
```

**Nothing maps to company, GST, tax identity, or POS identity as first-class data today** — these are Odoo-side realities not yet represented in the canonical schema at all.

## F. DB → business-logic mapping

`sales_fact_v` (repaired this session) → 15 business-logic files (`aov.ts`, `sales.ts`, `payment-analysis.ts`, `profitability.ts`, `store-performance.ts`, `store-forecast.ts`, `store-trend.ts`, 8 customer/retention files) → 3 API routes (`/api/sales/dashboard`, `/api/sales/dashboard-extended`, `/api/sales/status`). Fully traced this session; only one file (`store-performance.ts`) had a hardcoded-string dependency, now repaired.

## G. APIs consuming this data
Confirmed: the 3 Sales routes above. **Not re-verified this session:** Inventory, Founder, CRM, Retention, Finance dashboard APIs — these were audited for a different concern (Inventory ABC/reorder logic) in earlier phases of this engagement but not for Odoo-source-of-truth dynamism specifically.

## H. UI filters depending on hardcoded values

`/api/sales/status`'s `availableStores` is now confirmed dynamic (sourced from `sales_fact_v`, verified returning all 4 real store names with zero code changes). **Not yet verified:** category filters (given Finding B's whitespace-duplicate issue, a category dropdown sourced from `dim_products.category` would currently show `"Beverages"` and `"Beverages "` as two separate options).

## I. Hardcoded store/POS/GST/tax/category values remaining in the codebase

Catalogued across this session (not re-swept this turn): `cac.service.ts`, `ltv.service.ts`, `retention.service.ts` (hardcoded `monthlySpend` per literal store name), `founder/types.ts` (`STORE_WHITELIST`), `business-logic/filter-sql.ts` (billedBy→displayName mapping), `customer-retention/.../store-filter.tsx`, `crm/.../new-lead-modal.tsx` (hardcoded UI dropdowns), `store-normalizer.ts` (tentative — historical-import-only, unconfirmed). No GST/tax percentage hardcoding found anywhere (because no GST feature exists yet to hardcode against).

## J. Repairs already deployed and verified this session (not hypothetical — live evidence)

1. **`sales_fact_v` dynamic store attribution** — `src/scripts/update-odoo-compatibility-view.ts` changed from a `KLJ`/`SWN`-only `CASE` to `COALESCE(ds.name, 'Unknown Store')` joined via `fact_sales_orders.store_id = dim_stores.id`. Deployed; verified live: all 4 stores (`ZenZebra`, `KLJ`, `SWN`, `HQ27GGN`) appear by their real names, zero rows classified `"Head office"`.
2. **`store-performance.ts` NEW STORE logic** — changed from `billedBy === "SmartworksNoida Noida" || billedBy === "Klj store"` to a `store_dimension.opened_date`-driven check. **Correction needed per this prompt's §16:** the current implementation still collapses "unknown" into "known new" (missing `opened_date` → `"NEW STORE"`), not a genuine tri-state (`KNOWN MATURE` / `KNOWN NEW` / `UNKNOWN`). This satisfies the *previous* approved design (option b) but not this prompt's stricter three-way requirement — flagged as a gap, not silently reconciled.

## K. Places where records are silently dropped — investigated, not fully resolved

The 113→104 (trend, still open) orphan-order investigation: all `state='done'`, all `updated_at` within hours, historical `date_order` — consistent with transient sync-lag, self-correcting. **Not traced to exact code-level cause** (would require reading the current, actively-being-edited state of `syncSales.ts`, which belongs to your other session). This is the single most concrete open item from §5 of the new prompt.

## L. INNER JOIN data-loss risk

`sales_fact_v` Part B uses `JOIN fact_sales_lines fl ON fl.order_id = fo.id` (inner) with `LEFT JOIN` for `dim_products`/`dim_customers`/`dim_stores` — meaning an order with zero lines (§K) is correctly excluded from the view (nothing to show), but is **not flagged anywhere as "incomplete"** — it simply doesn't appear, which is indistinguishable from "this order doesn't exist" to anything reading the view. This is the §27 "zero-silent-drop rule" violation this new prompt explicitly calls out.

## M. Sync race/lag

Confirmed real and observed directly (§K). No dead-letter-queue or partial-sync flag currently surfaces this state to telemetry (per `sync_telemetry`'s schema, read earlier this session — no "orphan order count" field exists).

## N. Deduplication mechanism
`ON CONFLICT (id) DO UPDATE`, keyed on Odoo's own numeric IDs (prefixed `pos_`/`pos_line_`) — confirmed idempotent for orders/lines re-sync.

## O. Date/timezone conversion
`sales_fact_v`'s Odoo branch: `(fo.date_order AT TIME ZONE 'Asia/Kolkata')::date`. This is the only timezone conversion point found in the traced path — appears to be a single, consistent policy point rather than scattered conversions, though not exhaustively verified across every consumer.

## P. Financial sign conversion
`sales_fact_v` Part B contains its own qty-based refund-sign correction (`WHEN fl.qty < 0 AND price_subtotal > 0 THEN -price_subtotal`) — a simpler variant than the more rigorously-proven Formula C investigated earlier in this engagement (`SIGN(qty*price_unit)*ABS(price_subtotal)`, proven 100% exact against `fact_sales_orders.amount_untaxed` on 4,188 orders on a *different* database snapshot). **This inconsistency between the two formulas has not been reconciled or re-validated on the current dataset.**

## Q. Source-of-truth conflicts
None found beyond §J.2's tri-state gap and §P's dual-formula inconsistency — both explicitly flagged, not resolved.

---

## R. Phase 1 — Odoo source model, fully mapped (live queries, this turn)

Read-only `stock.warehouse` / `stock.picking.type` / `pos.config.warehouse_id` cross-check, resolving §B/§K's open item:

| pos.config | company_id | warehouse_id | picking_type default_location_src_id |
|---|---|---|---|
| 1 ZenZebra | 1 ZenZebra | 1 ZenZebra | 5 `HO/Stock` |
| 2 KLJ | 1 ZenZebra | 2 KLJ | 14 `KLJ/Stock` |
| 3 SWN | 1 ZenZebra | 3 SWN | 20 `SWN/Stock` |
| 4 HQ27GGN | 1 ZenZebra | 6 HQ27GGN | 54 → 3757 `HQ27/Stock` |

`stock.warehouse` id 6 ("HQ27GGN") has `lot_stock_id = [3757, "HQ27/Stock"]` — i.e. **Odoo's own warehouse record is the authority, and it says HQ27GGN's real stock location is 3757, not 3739.**

Location 3739 (`"HQ27GGN/Stock"`, confusingly the more specifically-named one) has `location_id: false` and `warehouse_id: false` — it is not attached to any warehouse hierarchy at all. It is a dangling/orphan location (likely a leftover from a warehouse rename), not a valid alternative.

**Resolution: the current mapping (location 3757) is CONFIRMED CORRECT.** No fix needed. Location 3739 should never be used and should not be treated as ambiguous going forward — it is orphaned data, not a competing source of truth.

**Second finding from this same query:** `pos.config` has its own `warehouse_id` field (Many2one, directly to `stock.warehouse`), which the current sync (`syncSales.ts`) never reads — it only reads `picking_type_id` and walks `picking_type → default_location_src_id`. `pos.config.warehouse_id → stock.warehouse.lot_stock_id` is a shorter, equally-authoritative path to the same answer, and also gives access to `stock.warehouse.code` (a clean short code — `WH`/`KLJ`/`SWN`/`HQ27` — a much better `dim_stores.code` source than the current fallback-to-`'STORE'` logic). **Recommendation for Phase 2 schema design: source `dim_stores.location_id` and `dim_stores.code` from `pos.config.warehouse_id → stock.warehouse`, not from `picking_type_id`.** Both paths currently agree, but the warehouse path is one hop shorter and exposes `code`, which the current picking-type path does not.

Tax (`account.tax`, 50 total across `sale`/`purchase`/`none`) and category (`product.category`, 11 records, confirmed no `parent_id` set on any of them — flat, not hierarchical) mappings from §B are otherwise confirmed unchanged by this query; no further ambiguity found in either.

---

## Decisions Requiring Your Input (updated — item 1 resolved this turn)

1. ~~HQ27GGN location ambiguity~~ — **RESOLVED (§R): current mapping (location 3757) is correct, confirmed via `stock.warehouse.lot_stock_id`.** No code change required for this specific item, but see §R's recommendation to re-source `dim_stores.location_id`/`code` from `pos.config.warehouse_id` in Phase 2 for a cleaner, one-hop path with a real `code` field.
2. **Category whitespace** (§B) — normalize at sync time or query time?
3. **Incomplete GSTINs for 2 companies** (§B) — treat as-is (per instruction not to fabricate) or raise with the Odoo administrator?
4. **New this report — §J.2's tri-state gap**: implement the stricter `KNOWN MATURE`/`KNOWN NEW`/`UNKNOWN` model this prompt requires, superseding the just-shipped binary version?
5. **§P's dual refund-formula inconsistency** — worth reconciling now, or defer?
6. Overall sequencing: proceed to Phase 1 (formal Odoo source-model mapping document) next, or prioritize §K (orphan-order root cause) first since it's the most concrete unresolved data-integrity item?

**No code or database was modified to produce this document.**
