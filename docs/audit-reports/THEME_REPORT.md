# Theme & Styling System Audit

This report reviews the theme engines, CSS variable mappings, color spaces, preset modifiers, and dark mode controls inside the project.

## 1. Theme Variables & OKLCH Color Tokens
The project utilizes **Tailwind CSS v4**'s `@theme` directive inside `src/app/globals.css` to map CSS variables to components using the modern, perceptually uniform **OKLCH** color space:
* **Background / Foreground**: `var(--background)` / `var(--foreground)` (mapped to `oklch(1 0 0)` / `oklch(0.145 0 0)`)
* **Primary / Accent**: `var(--primary)` / `var(--accent)`
* **Sidebar colors**: Standardized via custom `var(--sidebar)` and `var(--sidebar-border)` tokens.

---

## 2. Style Presets & Configurations
Presets are imported as sub-styles inside `globals.css` and applied dynamically via `data-theme-preset` attributes:
* **`brutalist`** (warm oranges/reds): Mapped to `oklch(0.6489 0.237 26.9728)`
* **`soft-pop`** (cooler purples): Mapped to `oklch(0.5106 0.2301 276.9656)`
* **`tangerine`** (deep orange): Mapped to `oklch(0.64 0.17 36.44)`
* **`default`** (clean monochrome fallback)

---

## 3. Dark Mode & Theme Toggle
* **Theme Switching**: Managed on the client via `next-themes` and stored in a browser cookie named `theme_mode`.
* **Mitigation of Flicker (SSR)**: The file `ThemeBootScript` (loaded inside `layout.tsx`'s `<head>`) reads the cookie on the server and applies the correct class (`.dark`) and variables before layout compilation to avoid flashing.

---

## 4. Exceptions & Audit Gaps

### ⚠️ Retention Forced Dark Mode
* **Component**: The newly reworked Customer Retention views (`OverviewTab`, `CohortsTab`, `LtvCacAovTab`) force dark background classes (`bg-zinc-950`, `bg-black/20`) and border variables (`border-zinc-800`) directly in the JSX.
* **Audit Issue**: If the user switches the application to **Light Mode**, the retention tab will remain dark, causing a design system inconsistency. It should be refactored to consume theme variables (`bg-card`, `border-border`) instead of hardcoded dark classes.
