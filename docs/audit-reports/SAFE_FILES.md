# Safe Files for Merge

This document lists the UI components, stylesheets, layouts, and page routes that are entirely safe to merge into the production repository immediately with zero integration risk.

## 1. Safe New Components
These are newly introduced layout components that have no overlap with existing production structures:
* `src/components/ui/metric-card.tsx` (Standardized metric card primative)
* `src/app/(main)/dashboard/retention/_components/ltv-cac-aov-tab.tsx` (Merged LTV/CAC/AOV tab)
* `src/app/api/customer-retention/ltv-cac-aov/route.ts` (Retention queries endpoint)
* `src/components/brand/ZenZebraLogo.tsx` (New logo component)
* `src/components/dashboard/export-button.tsx` (Standard PDF/CSV data exporter)
* `src/components/date-range-picker.tsx` (Clean date calendar range selector)

---

## 2. Safe Theme Presets & Styles
These styling overrides are encapsulated in Tailwind presets or custom global configurations, which do not modify baseline components:
* `src/styles/presets/brutalist.css`
* `src/styles/presets/soft-pop.css`
* `src/styles/presets/tangerine.css`
* `src/styles/flag-icons/flags.css`

---

## 3. Safe Page & Redirect Routes
These are new routes or simple client-side page redirects that do not affect core dashboard loading:
* `src/app/(main)/dashboard/retention/health/page.tsx` (Points to `?tab=segments`)
* `src/app/(main)/dashboard/retention/segments/page.tsx` (Points to `?tab=segments`)
* `src/app/(main)/dashboard/retention/overview/page.tsx` (Sub-tab content page)
* `src/app/(main)/dashboard/retention/cac/page.tsx` (Sub-tab content page)
* `src/app/(main)/dashboard/retention/cohorts/page.tsx` (Sub-tab content page)
* `src/app/(main)/dashboard/retention/ltv/page.tsx` (Sub-tab content page)
