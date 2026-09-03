# UI Component & Layout Inventory

This report maps the location, purpose, and integration readiness of every page, component, and utility layout in the UI codebase.

## 1. Page & Layout Directory Map

| Route / File | Core Responsibility | Status & Readiness |
| :--- | :--- | :--- |
| `src/app/layout.tsx` | Global layout wrapping query, auth, settings, and theme providers. Includes `ThemeBootScript`. | **Production Ready** |
| `src/app/(main)/dashboard/layout.tsx` | Side panel navigation wrapper incorporating the collapsable navigation panel. | **Production Ready** |
| `src/app/(main)/dashboard/sales/page.tsx` | Core Sales Dashboard. Visualizes performance statistics, waterfall charts, daily health grids, payment profiles. | **Production Ready** |
| `src/app/(main)/dashboard/ecommerce/page.tsx` | Store Command Center / Store Overview page displaying performance tables, forecasts, and store trend lines. | **Production Ready** |
| `src/app/(main)/dashboard/retention/page.tsx` | Central Customer Retention screen organizing Overview, Cohorts, Segments & Health, and LTV/CAC/AOV. | **Production Ready** (Gautam 2.0 Rework) |
| `src/app/(main)/dashboard/crm/page.tsx` | CRM visualizer demonstrating deals, qualified pipeline flows, meeting agendas, and task targets. | **Placeholder** (Uses mock equations on sales metrics) |
| `src/app/(main)/dashboard/finance/page.tsx` | Flat dashboard view showing balance summaries. | **Placeholder** (Renders "Coming Soon" splash block) |
| `src/app/(main)/dashboard/analytics/page.tsx` | Traffic Analytics view showing footfall timelines, quality scores, and device distributions. | **Experimental** (Partially implemented) |
| `src/app/(main)/dashboard/sales/upload/page.tsx` | Transactional CSV / Excel file chunked uploader. | **Production Ready** (Uses `xlsx` parser) |

---

## 2. Reusable Primitives (`src/components/ui/`)

All components in this directory are wrapped Radix UI controls styled with Tailwind CSS v4 variables:
* **Layouts / Sheets**: `card`, `dialog`, `drawer`, `sheet`, `resizable`, `scroll-area`, `sidebar`.
* **Inputs & Forms**: `button`, `button-group`, `calendar`, `checkbox`, `combobox`, `command`, `dropdown-menu`, `input`, `input-group`, `input-otp`, `native-select`, `radio-group`, `select`, `slider`, `switch`, `textarea`, `toggle`, `toggle-group`.
* **Visual Data**: `badge`, `progress`, `table`, `tabs`, `tooltip`, `metric-card` (custom standard metric component).
* **Feedback / Helpers**: `accordion`, `alert`, `alert-dialog`, `avatar`, `breadcrumb`, `carousel`, `chart` (wrapper configuration), `empty`, `hover-card`, `kbd`, `label`, `menubar`, `navigation-menu`, `pagination`, `skeleton`, `sonner` (toaster), `spinner`.

---

## 3. High-Level Feature Components

* **`GlobalFilterBar` (`src/components/founder/global-filter-bar.tsx`)**: Global workspace filter component. Syncs dates, stores, categories, and SKU values with the global Zustand store.
* **`TrendChart` (`src/components/store-overview/TrendChart.tsx`)**: Recharts AreaChart plotting sales distributions. Renders store checkboxes dynamically.
* **`DataFreshnessSystem` (`src/components/dashboard/data-freshness-system.tsx`)**: Displays database update indicators.
* **`ExportButton` (`src/components/dashboard/export-button.tsx`)**: Component with export hooks for PDF/Excel/CSV.

---

## 4. Reusability & Deprecation Audit

* **Production Ready**: Primitives library, Sales and Retention layouts, GlobalFilterBar, TrendChart, and ExportButton.
* **Experimental**: Analytics dashboards (partially mock).
* **Deprecated / Unused**:
  * Legacy individual retention folders (`/dashboard/retention/ltv`, `/retention/cac`, `/retention/cohorts`, `/retention/overview`, `/retention/segments`).
  * `customer-retention/ltv-cac-aov` route duplicates Gautam's active merged view and is redundant.
* **Duplicates**: Redundant legacy API routes under `/api/customer-retention` that have been replaced by Gautam's centralized `ltv-cac-aov` endpoint.
