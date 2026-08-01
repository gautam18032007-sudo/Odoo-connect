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
				executeFetch(true);
			}, refreshInterval);
		}

		return () => {
			if (intervalId) clearInterval(intervalId);
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
