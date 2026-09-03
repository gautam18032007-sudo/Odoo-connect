# ZenZebra UI Audit & Merge Preparation Report

## 1. Repository Overview
This repository contains the UI implementation for the ZenZebra Sales CRM application, built using **Next.js 16 (App Router)** and styled with **Tailwind CSS v4** and **Shadcn UI (Radix Primitives)**. 

During our investigation, we discovered that the workspace contains two layers:
1. **Outer Workspace (`zenzebrasalescrm-main/`)**: The active runtime workspace where the development server runs. It has a `.git` folder initialized but no commits made. It represents a merge of an older codebase with recent UI changes made in Gautam 2.0.
2. **Inner Directory (`zenzebrasalescrm/`)**: A nested Git repository checked out to branch `gautam-2.0`. This sub-repository contains the actual, detailed commit history (45+ commits) including recent feature releases from both Diwakar Bhagat and Gautam.

---

## 2. Commit Timeline (Last 20 Commits)

| Commit Hash | Author | Timestamp | Purpose & Scope | UI Only | Logic | Styling | Routing | New Comp. |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `2dab885` | Gautam | 2026-07-03 18:49:46 | Rework Customer Retention module; merge Segments & Health; dark bento theme | Yes | Yes | Yes | Yes | Yes |
| `4c0ef6b` | Gautam | 2026-07-03 10:52:31 | Initial commit for Gautam 2.0; introduce retention API and V2 pages | Yes | Yes | Yes | Yes | Yes |
| `1ead11d` | Diwakar Bhagat | 2026-07-01 22:04:31 | Add Odoo purchase chunked upload UI/API; plot purchases in Momentum | No | Yes | Yes | No | Yes |
| `d5d3e3a` | Diwakar Bhagat | 2026-07-01 21:40:45 | Implement client-side parsing & chunked staging (5K rows) for 413 error | No | Yes | Yes | No | No |
| `c57b609` | Diwakar Bhagat | 2026-07-01 21:16:33 | Implement purchase and Odoo webhook integrations | No | Yes | Minor | No | No |
| `fb76026` | Diwakar Bhagat | 2026-06-25 23:27:14 | transition to incremental uploads; data health audit endpoint | No | Yes | No | No | No |
| `b10be93` | Diwakar Bhagat | 2026-06-25 23:08:30 | Fix store normalization, data leaks and edge cases | No | Yes | No | No | No |
| `f81192b` | Diwakar Bhagat | 2026-06-25 15:00:13 | Documentation updates in README.md | Yes | No | No | No | No |
| `1397350` | Diwakar Bhagat | 2026-06-24 13:13:11 | Store KPI normalization, central metric layer, waterfall chart | No | Yes | Yes | No | Yes |
| `9517b20` | Diwakar Bhagat | 2026-06-23 18:59:59 | Rename "Web Analytics" to "Analytics" | Yes | No | No | Yes | No |
| `81b90cf` | Diwakar Bhagat | 2026-06-23 18:58:39 | Rebrand "Realtime Visitors" to "Realtime Footfall" | Yes | No | Yes | No | No |
| `57eb213` | Diwakar Bhagat | 2026-06-23 18:53:11 | Sales dashboard measurements corrections, custom comparisons, badges | Yes | Yes | Yes | No | No |
| `6547533` | Diwakar Bhagat | 2026-06-21 17:05:08 | Remove GitHub logo button from dashboard header | Yes | No | Yes | No | No |
| `d4ed771` | Diwakar Bhagat | 2026-06-19 20:09:36 | Fix store performance grouping logic and TopProducts warnings | No | Yes | No | No | No |
| `2c4866e` | Diwakar Bhagat | 2026-06-19 19:52:03 | Restore database clears; split KPI cards by store; date anchors | No | Yes | Yes | No | No |
| `09fff48` | Diwakar Bhagat | 2026-06-19 19:30:13 | Fix 404 broken redirects and dashboard routes | Yes | No | No | Yes | No |
| `1bfb6fd` | Diwakar Bhagat | 2026-06-19 19:06:45 | Add sale_time, billed_by, total_amount, taxes, payment_method to DB schema | No | Yes | No | No | No |
| `2d46846` | Diwakar Bhagat | 2026-06-19 19:03:28 | Fix duplicate 'name' key in validation header aliases | No | Yes | No | No | No |
| `ceb352e` | Diwakar Bhagat | 2026-06-19 17:32:38 | Parse time/taxes/payment details in import validator | No | Yes | No | No | No |
| `6eae767` | Diwakar Bhagat | 2026-06-19 17:29:04 | Extend TypeScript typings for new transaction fields | No | Yes | No | No | No |

---

## 3. File Changes

### Discrepancy between Outer Workspace and Inner Git Repo (`gautam-2.0`):
The most critical finding of this audit is that **the outer workspace is missing a core set of files** related to the **Purchase Staging** and **Odoo webhook integrations** that were developed by Diwakar on July 1. However, the outer workspace *does* contain Gautam's new retention pages from July 3.

* **Files only in the inner repo (missing from outer workspace)**:
  * `src/lib/business-logic/purchase.ts` (Core purchase formulas)
  * `src/lib/business-logic/profitability.ts` (Profitability block calculator)
  * `src/lib/business-logic/margin.ts` (Margin logic)
  * `src/lib/founder/purchase-import-service.ts` (Client side excel importer for purchases)
  * `src/lib/parser/purchase-parser.ts` (Excel parser for purchase facts)
  * `src/app/api/webhooks/odoo/` (Folder with 4 sync webhooks: `sales`, `crm`, `inventory`, `purchase`)
  * `src/scripts/migrate-purchase-fact.ts` (SQL migration script for purchases)
  * `src/scripts/seed-purchase-from-excel.ts` (Seed script)
  * `src/scripts/migrate-odoo-webhook-tables.ts` (SQL migration script)
  * `ODOO_INTEGRATION_PLAN.md` (Integration rules)

* **Whitespace / Formatting Difference**:
  * Outer workspace files are indented with **Tabs**.
  * Inner subfolder (`zenzebrasalescrm`) files are indented with **2 Spaces**.

---

## 4. New Components
* **`ltv-cac-aov-tab.tsx`**: Renders LTV growth curves, CAC Payback matrix, AOV expansion bars, and a filterable, paginated high-value customer table.
* **`metric-card.tsx`**: A standardized primitive card block supporting positive/negative growth percentages, sub-labels, and custom Lucide icons.
* **`data-freshness-system.tsx`**: Component visualizer highlighting when the database was last updated, displaying status pills.

---

## 5. Changed Components
* **`cohorts-tab.tsx`**: Reworked to render M1 retention percentages inside round pill badges with gradient opacity color-coding (dark theme look).
* **`overview-tab.tsx`**: Updated to show AreaCharts plotting New vs Returning customer revenues and customer mixes.
* **`global-filter-bar.tsx`**: Polished to hook into Zustand state store filters (stores, categories, brands, custom date ranges).
* **`TrendChart.tsx`**: Extended to draw multiple lines dynamically for multiple selected stores with interactive checkboxes.

---

## 6. Routing Changes
* **Customer Retention Route Restructuring**:
  * Legacy individual routes `/dashboard/retention/health` and `/dashboard/retention/segments` are now marked as redirects that point straight to `/dashboard/retention?tab=segments`.
  * The primary dashboard route `/dashboard/retention` now acts as a central hub running 4 tab components (`overview`, `cohorts`, `segments`, `ltv-cac-aov`).
* **Broken Settings Page**:
  * `/dashboard/settings` is linked in the sidebar, but no file is present at `src/app/(main)/dashboard/settings/page.tsx` (returns 404).

---

## 7. Chart Inventory

All charts are implemented using **Recharts** wrapped in responsive sizing containers.

| Chart | Location | Library Component | Purpose / Fields | Responsiveness |
| :--- | :--- | :--- | :--- | :---: |
| **Sales Trend** | `TrendChart.tsx` | `AreaChart` | Dynamic lines representing revenue per store | Complete |
| **Revenue Mix** | `overview-tab.tsx` | `AreaChart` | Plots New vs Returning customer revenues | Complete |
| **Customer Mix** | `overview-tab.tsx` | `AreaChart` | Plots New vs Returning customer volume | Complete |
| **Cohort LTV** | `ltv-cac-aov-tab.tsx` | `LineChart` | Progression curves for Jan/Feb cohort values | Complete |
| **AOV Expansion** | `ltv-cac-aov-tab.tsx` | `BarChart` | expansion bars for 1st, 2nd, 3rd, 4th+ orders | Complete |
| **Waterfall Flow** | `sales/page.tsx` | `ComposedChart` | MRP Value vs Discount vs Collection vs GST vs Net Revenue | Complete |
| **Qualified Lead Flow** | `pipeline-activity.tsx` | `BarChart` | Visualizes pseudo CRM lead flow based on sales volume | Complete |

---

## 8. Responsive Issues
* **Global Filter Bar**: Dropdown buttons use hardcoded widths (e.g. `w-[150px]`, `w-[180px]`). On small mobile viewports, the buttons wrap and overflow container spacing.
* **Bento Grid**: The CSS Columns bento layout (`columns-1 sm:columns-2 lg:columns-3 xl:columns-4`) can result in uneven masonry alignments depending on chart heights.
* **Tables**: Customer tables in `ltv-cac-aov-tab.tsx` are safe because they are wrapped in an `overflow-x-auto` wrapper with a minimum width constraint of `min-w-[800px]`, prompting clean horizontal scroll on mobile.

---

## 9. Theme System
* **Core**: Tailwind CSS v4 variables mapped inside `globals.css` using OKLCH values.
* **Switching**: Synchronized via `next-themes` and a `ThemeBootScript` to prevent flashing on load.
* **Presets**: Loaded dynamically via data attributes on `<html>`:
  * `brutalist` (primary: `oklch(0.6489 0.237 26.9728)`)
  * `soft-pop` (primary: `oklch(0.5106 0.2301 276.9656)`)
  * `tangerine` (primary: `oklch(0.64 0.17 36.44)`)
* **Retention Exception**: The customer retention tab ignores standard light variables and enforces a dark bento layout themed around a dark zinc/emerald palette.

---

## 10. Reusable Component Inventory
* **Primitives (`src/components/ui/*`)**: `accordion`, `alert-dialog`, `badge`, `button`, `calendar`, `card`, `carousel`, `chart`, `combobox`, `dialog`, `drawer`, `dropdown-menu`, `input`, `metric-card`, `pagination`, `popover`, `progress`, `scroll-area`, `select`, `sidebar`, `skeleton`, `table`, `tabs`, `tooltip`.
* **Business Modules**: `GlobalFilterBar`, `TrendChart`, `ExportButton`, `DateRangePicker`.

---

## 11. Technical Debt
1. **Mock CRM Logic**: `PipelineActivity.tsx` and `TaskReminders.tsx` use artificial equations (e.g. `Math.round(totalQualified * 0.48)`) to fake CRM stages and discovery calls on top of sales orders. Meetings and contacts are fully static strings.
2. **Placeholder Finance Page**: `finance/page.tsx` displays a static "Finance module coming soon" card rather than actual financial analytics.
3. **Broken Settings Page**: Settings icon points to `/dashboard/settings` which yields a 404 page.
4. **Dead Dependencies**: `ioredis` and `cheerio` are defined in `package.json` but never imported or utilized.

---

## 12. Merge Risks
* **Missing Purchase & Odoo Logic**: Merging the outer workspace files will erase the purchase staging tables, Excel parser, webhook handlers, and margin calculation files. 
* **Whitespace Conflicts**: Outer workspace uses tabs; inner repo uses spaces. Merging the files directly will cause massive git conflict blocks due to indentations.
* **Duplicate API folder structure**: `customer-retention/ltv-cac-aov` route duplicates older individual retention routes.

---

## 13. Recommended Merge Order
1. **Synchronize Files**: Copy the missing purchase and webhook files from the inner repository (`zenzebrasalescrm/src/...`) to the outer workspace.
2. **Unify Indentation**: Format all files using the configured Biome configuration (`npm run format`) to ensure space/tab differences are resolved before committing.
3. **Commit Staged Workspace**: Commit the synchronized outer workspace to a release branch (e.g., `release-v2.2`).
4. **Resolve Settings Redirect**: Create a settings skeleton page or remove the redirect.
5. **Merge with Production Analytics**: Merge the release branch into the core production codebase.

---

## 14. Files Safe To Merge
* `src/components/ui/metric-card.tsx`
* `src/app/(main)/dashboard/retention/_components/ltv-cac-aov-tab.tsx`
* `src/app/api/customer-retention/ltv-cac-aov/route.ts`
* `src/styles/presets/*.css`

---

## 15. Files That Need Manual Review
* `src/app/(main)/dashboard/sales/upload/page.tsx` (Contains mixed sales vs purchase upload features)
* `src/app/api/sales/imports/route.ts` (Combines chunked sales and purchase fact insert logic)
* `src/components/founder/global-filter-bar.tsx` (Wired into state store variables)

---

## 16. Final Readiness Score

| Category | Score | Summary Rationale |
| :--- | :---: | :--- |
| **Architecture** | 8/10 | Well structured, clean service separation; CRM/Settings gaps hold it back. |
| **Maintainability** | 7/10 | White space discrepancies and unused packages need formatting resolution. |
| **Scalability** | 9/10 | Chunked staging (5K rows) resolves payload limitations successfully. |
| **Responsiveness** | 8/10 | Horizontal scrollable tables are safe, but mobile filter bar wrap needs visual polish. |
| **Accessibility** | 6/10 | Relies on default Radix hooks; contrast on dark emerald items needs checking. |
| **Consistency** | 7/10 | Mixed light/dark styles; retention tab runs its own forced dark bento style. |
| **Reusability** | 8/10 | Standard components library is highly comprehensive and modular. |
| **Performance** | 7/10 | Responsive container sizing is fast, bundle sizes could be optimized. |
| **Design System** | 8/10 | Multi-preset support (Tangerine, Brutalist, Soft Pop) works cleanly. |
| **Code Quality** | 8/10 | Biome linter check verifies solid type-safety and formatting bounds. |
| **OVERALL READINESS**| **7.6/10**| **Ready once missing purchase/webhook files are restored to the active workspace.** |
