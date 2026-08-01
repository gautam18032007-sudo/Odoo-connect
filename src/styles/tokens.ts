/**
 * ZenZebra Enterprise Design Tokens (v5.0)
 * Single Source of Truth for Layout, Spacing, Color, Radius & Glassmorphism Tokens.
 *
 * LOCKED CORE: Styling only. Zero calculation or data logic.
 */

export const tokens = {
	colors: {
		background: {
			canvas: "bg-zinc-950",
			card: "bg-zinc-900/60",
			cardHover: "hover:bg-zinc-900/80",
			glass: "bg-white/5",
			glassSubtle: "bg-white/[0.02]",
		},
		border: {
			subtle: "border-zinc-800/80",
			glass: "border-white/10",
			highlight: "border-zinc-700/80",
		},
		text: {
			primary: "text-zinc-100",
			secondary: "text-zinc-400",
			muted: "text-zinc-500",
			accent: "text-emerald-400",
		},
		status: {
			positive: {
				bg: "bg-emerald-500/10",
				text: "text-emerald-400",
				border: "border-emerald-500/20",
			},
			negative: {
				bg: "bg-rose-500/10",
				text: "text-rose-400",
				border: "border-rose-500/20",
			},
			warning: {
				bg: "bg-amber-500/10",
				text: "text-amber-400",
				border: "border-amber-500/20",
			},
			neutral: {
				bg: "bg-zinc-800/60",
				text: "text-zinc-400",
				border: "border-zinc-700/50",
			},
		},
	},

	radius: {
		sm: "rounded-lg",
		md: "rounded-xl",
		lg: "rounded-2xl",
		full: "rounded-full",
	},

	effects: {
		glass:
			"backdrop-blur-xl bg-white/5 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.12)]",
		glassHover:
			"transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.2)] hover:-translate-y-0.5",
		cardBase:
			"relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950 p-5 shadow-none",
	},

	typography: {
		titleExecutive:
			"text-3xl font-bold leading-none tracking-tight text-zinc-100",
		subtitleExecutive: "text-sm text-zinc-400",
		cardTitle: "text-lg font-mono text-zinc-100",
		cardDescription: "text-xs text-zinc-500",
		metricValue: "text-2xl font-bold tracking-tight text-zinc-100 font-mono",
		kpiLabel: "text-xs font-semibold tracking-wider uppercase text-zinc-400",
	},

	layout: {
		dashboardPadding: "flex flex-col gap-6 p-4 md:p-8 pt-4",
		gridKpi: "grid gap-4 md:grid-cols-2 lg:grid-cols-4",
		gridCharts: "grid gap-6 xl:grid-cols-2 items-stretch",
		gridTables: "grid gap-6 xl:grid-cols-[1.3fr_0.7fr] items-stretch",
	},
} as const;

export type DesignTokens = typeof tokens;
