"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export interface UseRealtimeFreshnessOptions {
	intervalMs?: number; // default 5000ms
	enabled?: boolean;
}

/**
 * Client-side real-time freshness hook.
 * Polls server freshness timestamp every 5 seconds ONLY while tab is active
 * and triggers Next.js `router.refresh()` automatically when data changes.
 */
export function useRealtimeFreshness(
	options: UseRealtimeFreshnessOptions = {},
): void {
	const { intervalMs = 5000, enabled = true } = options;
	const router = useRouter();
	const lastProcessedRef = useRef<string | null>(null);

	useEffect(() => {
		if (!enabled) return;

		let isMounted = true;
		const checkFreshness = async () => {
			if (
				typeof document !== "undefined" &&
				document.visibilityState !== "visible"
			) {
				return; // Skip if tab is hidden
			}

			try {
				const res = await fetch("/api/health", {
					method: "GET",
					cache: "no-store",
				});
				if (!res.ok) return;
				const data = await res.json();
				const lastReceived = data?.checks?.webhookQueue?.lastEventReceived;

				if (lastReceived) {
					if (
						lastProcessedRef.current &&
						lastProcessedRef.current !== lastReceived
					) {
						console.log(
							"[realtimeFreshness] Webhook event detected. Triggering router.refresh()",
						);
						router.refresh();
						if (typeof window !== "undefined") {
							window.dispatchEvent(new CustomEvent("odoo-sync-updated"));
						}
					}
					lastProcessedRef.current = lastReceived;
				}
			} catch {
				// Silent ignore network errors
			}
		};

		const timer = setInterval(() => {
			if (isMounted) {
				checkFreshness();
			}
		}, intervalMs);

		return () => {
			isMounted = false;
			clearInterval(timer);
		};
	}, [enabled, intervalMs, router]);
}
