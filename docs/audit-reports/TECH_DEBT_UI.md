# UI Technical Debt & Polish Checklist

This report logs UI-specific technical debt, incomplete layouts, pseudo-mockups, and integrations-readiness checklist checks.

## 1. Technical Debt & Polish Checklist

### ✅ Direct Database / SQL Separation
* **Check**: Ensure no raw SQL queries or database connectives reside directly inside the component folders.
* **Status**: Passed. All UI layouts query via client-side `fetch` calls to Next.js API endpoints or consume data through Zustand/Query stores.

### ⚠️ Mock CRM Dashboard UI (`crm/page.tsx`)
* **Debt**: The CRM components map mock statuses ("Proposal Sent", "Needs Review", "At Risk") dynamically based on order indexes to simulate a complete CRM experience.
* **Refactor Required**: Replace this index-based mapping with real data integrations once CRM tables are defined in production.

### ⚠️ Placeholder Finance Page (`finance/page.tsx`)
* **Debt**: Renders a static placeholder card warning "coming soon" instead of querying ledger metrics.
* **Refactor Required**: Connect this page to financial schema queries once the source files are ready.

### ⚠️ Non-existent Settings Route
* **Debt**: Settings icon in the sidebar links to `/dashboard/settings` which outputs a 404 error since the page directory does not exist.
* **Refactor Required**: Create a settings page or redirect to a profile settings modal.

### ⚠️ Forced Dark styling in Retention
* **Debt**: Reworked retention tabs bypass the global theme settings (light/dark toggle) by specifying dark zinc classes directly in code, causing styles to mismatch.
* **Refactor Required**: Update retention tabs to consume Tailwind CSS variables (`bg-card`, `border-border`) so they adapt to light mode selections.

---

## 2. Interactive UI Polish Audit

* **Loading States**: Handled correctly. Key screens like Sales and Retention use `<Skeleton>` components to visually block layouts during fetch queries.
* **Empty States**: Present. Sales, CRM, and Retention dashboards check `status.hasData` and render a descriptive welcome box prompting the user to upload data if the database is empty.
* **Dead Packages**: `ioredis` and `cheerio` are defined in `package.json` but are not imported or utilized, representing unused node modules.
