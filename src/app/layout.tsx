import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { AuthProvider } from "@/components/providers/auth-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_CONFIG } from "@/config/app-config";
import { fontVars } from "@/lib/fonts/registry";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";
import { ThemeBootScript } from "@/scripts/theme-boot";
import { PreferencesStoreProvider } from "@/stores/preferences/preferences-provider";
import { SettingsProvider } from "@/stores/settings/settings-provider";

import "./globals.css";

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	maximumScale: 5,
	viewportFit: "cover",
};

const metadataBase = new URL(
	process.env.NEXT_PUBLIC_APP_URL ??
		(process.env.VERCEL_PROJECT_PRODUCTION_URL &&
			`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ??
		(process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ??
		"https://crm-for-apparel.vercel.app",
);

export const metadata: Metadata = {
	metadataBase,
	title: {
		template: `%s | ${APP_CONFIG.name}`,
		default: APP_CONFIG.meta.title,
	},
	description: APP_CONFIG.meta.description,
	openGraph: {
		title: APP_CONFIG.meta.title,
		description: APP_CONFIG.meta.description,
		type: "website",
		siteName: APP_CONFIG.name,
		images: ["/og-image.png"],
	},
	twitter: {
		card: "summary_large_image",
		title: APP_CONFIG.meta.title,
		description: APP_CONFIG.meta.description,
		images: ["/og-image.png"],
	},
	icons: {
		icon: "/logo.png",
		shortcut: "/logo.png",
		apple: "/logo.png",
	},
};

export default function RootLayout({
	children,
}: Readonly<{ children: ReactNode }>) {
	const {
		theme_mode,
		theme_preset,
		content_layout,
		navbar_style,
		sidebar_variant,
		sidebar_collapsible,
		font,
	} = PREFERENCE_DEFAULTS;
	return (
		<html
			lang="en"
			data-theme-mode={theme_mode}
			data-theme-preset={theme_preset}
			data-content-layout={content_layout}
			data-navbar-style={navbar_style}
			data-sidebar-variant={sidebar_variant}
			data-sidebar-collapsible={sidebar_collapsible}
			data-font={font}
			suppressHydrationWarning
		>
			<head>
				{/* Applies theme and layout preferences on load to avoid flicker and unnecessary server rerenders. */}
				<ThemeBootScript />
			</head>
			<body className={`${fontVars} min-h-screen antialiased`}>
				<TooltipProvider>
					<PreferencesStoreProvider
						themeMode={theme_mode}
						themePreset={theme_preset}
						contentLayout={content_layout}
						navbarStyle={navbar_style}
						font={font}
					>
						<AuthProvider>
							<QueryProvider>
								<SettingsProvider>{children}</SettingsProvider>
							</QueryProvider>
						</AuthProvider>
						<Toaster />
					</PreferencesStoreProvider>
				</TooltipProvider>
			</body>
		</html>
	);
}
