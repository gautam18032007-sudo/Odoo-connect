# Responsive Layout & Viewport Audit (RC1)

This report logs responsive design findings, scaling issues, and structural layout notes across Mobile, Tablet, and Desktop resolutions.

## 1. Responsive Layout Audit Findings

### ⚠️ Global Filter Bar Dropdowns (`global-filter-bar.tsx`)
* **Issue**: Individual dropdown filters (Store, Category, Brand, Date Range) use hardcoded widths (e.g. `w-[150px]`, `w-[180px]`).
* **Viewport Behavior**: On narrow mobile viewports, these buttons wrap vertically and can clip container borders.
* **Risk**: High-risk visual wrap.

### ⚠️ Bento Grid Height Variances (`ltv-cac-aov-tab.tsx`)
* **Issue**: The Customer Retention layout uses CSS Columns columns-1 sm:columns-2 lg:columns-3 xl:columns-4 to build a bento masonry view.
* **Viewport Behavior**: Masonry columns can align cards unevenly depending on internal chart canvas dimensions, causing layout gaps.
* **Risk**: Low-risk visual inconsistency.

### ✅ Tables Horizontal Scroll (`ltv-cac-aov-tab.tsx` & `cohorts-tab.tsx`)
* **Issue**: Massive customer metadata grids and cohort matrixes risk clipping columns on mobile.
* **Viewport Behavior**: Elements are wrapped inside an `overflow-x-auto w-full` container, and the tables specify a minimum width of `min-w-[800px]`. This ensures table boundaries are preserved and columns can be scrolled cleanly on small screens.
* **Risk**: Safe.

### ✅ Sidebar Auto-Collapse (`sidebar.tsx`)
* **Issue**: Sidebar navigation panels blocking screen space on tablets and phones.
* **Viewport Behavior**: Collapsible hooks (`use-mobile.ts`) track viewport width and automatically slide the sidebar out of view when viewport is under `768px` (mobile viewport bound).
* **Risk**: Safe.
