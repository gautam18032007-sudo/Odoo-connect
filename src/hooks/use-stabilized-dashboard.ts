"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseStabilizedDashboardOptions<T> {
	/** Async function to fetch data. Should accept an AbortSignal. */
	fetcher: (signal: AbortSignal) => Promise<T | null>;
	/** Whether the hook is enabled for fetching. Defaults to true. */
	enabled?: boolean;
	/** Optional refresh interval in milliseconds for background polling. */
	refreshInterval?: number;
	/** Dependencies array triggering re-fetches when changed. */
	dependencies?: any[];
}

export interface StabilizedDashboardResult<T> {
	data: T | null;
	isInitialLoading: boolean;
	isRefreshing: boolean;
	error: string | null;
	refetch: () => Promise<void>;
}

/**
 * Enterprise Zero-Blink Dashboard Data Hook
 *
 * Ensures mounted UI elements (cards, charts, tables) remain 100% mounted during data refreshes
 * and filter updates. Never resets data to null while refreshing. Integrates AbortController
 * to discard stale in-flight requests.
 */
export function useStabilizedDashboard<T>({
	fetcher,
	enabled = true,
	refreshInterval,
	dependencies = [],
}: UseStabilizedDashboardOptions<T>): StabilizedDashboardResult<T> {
	const [data, setData] = useState<T | null>(null);
	const [isInitialLoading, setIsInitialLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const dataRef = useRef<T | null>(data);
	dataRef.current = data;

	const abortControllerRef = useRef<AbortController | null>(null);
	const requestIdRef = useRef(0);
	const fetcherRef = useRef(fetcher);
	fetcherRef.current = fetcher;
	// Tracks whether a request is currently in flight. Aborting a fetch()
	// only stops the client from waiting on it — the Next.js API route
	// handler keeps running its already-dispatched DB queries to completion
	// server-side regardless. So the periodic poll tick (below) skips
	// entirely while one is outstanding, instead of abort-and-replace,
	// to avoid piling additional queries on top of a slow one still running.
	const isFetchingRef = useRef(false);

	const executeFetch = useCallback(
		async (isBackground = false) => {
			if (!enabled) return;

			// Abort previous in-flight request to avoid race conditions
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
			}

			const controller = new AbortController();
			abortControllerRef.current = controller;
			const currentRequestId = ++requestIdRef.current;
			isFetchingRef.current = true;

			const isFirstLoad = dataRef.current === null;

			if (isFirstLoad && !isBackground) {
				setIsInitialLoading(true);
			} else {
				setIsRefreshing(true);
			}

			try {
				const result = await fetcherRef.current(controller.signal);

				// Ignore stale responses if a newer request was dispatched
				if (currentRequestId !== requestIdRef.current) {
					return;
				}

				if (result !== null) {
					setData(result);
					setError(null);
				}
			} catch (err: any) {
				if (err?.name === "AbortError") {
					// Ignore cancelled requests
					return;
				}
				if (currentRequestId === requestIdRef.current) {
					console.error("Dashboard data fetch failed:", err);
					setError(err?.message || "Failed to load dashboard data.");
				}
			} finally {
				if (currentRequestId === requestIdRef.current) {
					setIsInitialLoading(false);
					setIsRefreshing(false);
					isFetchingRef.current = false;
				}
			}
		},
		[enabled],
	);

	// Fetch on dependency changes
	useEffect(() => {
		if (!enabled) return;
		executeFetch(false);

		let intervalId: NodeJS.Timeout | null = null;
		if (refreshInterval && refreshInterval > 0) {
			intervalId = setInterval(() => {
				// Skip background-tab ticks entirely — a hidden/minimized tab has
				// no need for fresh data, and polling it anyway burns DB compute
				// for nobody. We catch up immediately on refocus instead (below).
				if (typeof document !== "undefined" && document.hidden) return;
				// Skip this tick if the previous poll hasn't finished — a slow
				// or degraded DB response must not accumulate additional
				// concurrent query load on top of itself (see isFetchingRef).
				if (isFetchingRef.current) return;
				executeFetch(true);
			}, refreshInterval);
		}

		const handleRealtimeUpdate = () => {
			executeFetch(true);
		};
		const handleVisibilityChange = () => {
			if (typeof document !== "undefined" && !document.hidden) {
				executeFetch(true);
			}
		};
		if (typeof window !== "undefined") {
			window.addEventListener("odoo-sync-updated", handleRealtimeUpdate);
			document.addEventListener("visibilitychange", handleVisibilityChange);
		}

		return () => {
			if (intervalId) clearInterval(intervalId);
			if (typeof window !== "undefined") {
				window.removeEventListener("odoo-sync-updated", handleRealtimeUpdate);
				document.removeEventListener(
					"visibilitychange",
					handleVisibilityChange,
				);
			}
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
			}
		};
		// eslint-disable-next-deps
	}, [enabled, executeFetch, refreshInterval, ...dependencies]);

	const refetch = useCallback(async () => {
		await executeFetch(true);
	}, [executeFetch]);

	return {
		data,
		isInitialLoading,
		isRefreshing,
		error,
		refetch,
	};
}
