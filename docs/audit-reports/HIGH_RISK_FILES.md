# High Risk Files for Merge

This document details the UI files, endpoints, and components that represent high integration risks due to overlapping backend structures or layout modifications, along with required reconciliation actions.

## 1. High Risk Files Breakdown

### 🚨 `src/app/(main)/dashboard/sales/upload/page.tsx`
* **Why it is High Risk**: This file contains the client-side Excel parsing and uploader forms. However, the outer workspace version of this file **excludes all purchase excel upload tabs/views** which are present on the `gautam-2.0` branch in the inner repository.
* **Reconciliation Action**: Perform a visual line-by-line comparison to restore the purchase loader layout before staging the merge.

### 🚨 `src/app/api/sales/imports/route.ts`
* **Why it is High Risk**: Manages server-side chunked transaction uploads and handles Excel row splits. The outer workspace version **is missing the handler block for Odoo purchase excel rows (`purchase_fact` staging tables)**.
* **Reconciliation Action**: Re-import the purchase staging handlers from the inner repository.

### 🚨 `src/lib/founder/import-service.ts`
* **Why it is High Risk**: Integrates the database transactional upload hooks and validation schemas. The outer workspace version **excludes purchase fact validations and deduplication hashes**.
* **Reconciliation Action**: Restore purchase validations and deduplication blocks.

### 🚨 `src/components/founder/global-filter-bar.tsx`
* **Why it is High Risk**: This core visual filter is linked directly to the Zustand filter store. It contains hardcoded pixel widths (`w-[150px]`, `w-[180px]`) which can cause components to wrap and clip on narrow screens.
* **Reconciliation Action**: Audit responsive styling and check store name mappings against production database columns.
