"use client";

import { createContext, useContext, useEffect, useState } from "react";

import { type StoreApi, useStore } from "zustand";

import { createSettingsStore, type SettingsState } from "./settings-store";

const SettingsStoreContext = createContext<StoreApi<SettingsState> | null>(
	null,
);

/**
 * SettingsProvider
 *
 * Wraps the app and fetches global settings from `/api/settings` on mount.
 * Children can consume the store via `useSettingsStore(selector)`.
 */
export function SettingsProvider({ children }: { children: React.ReactNode }) {
	const [store] = useState<StoreApi<SettingsState>>(() =>
		createSettingsStore(),
	);

	useEffect(() => {
		const fetchSettings = async () => {
			try {
				const res = await fetch("/api/settings");
				if (res.ok) {
					const data = await res.json();
					if (data.settings) {
						store.getState().hydrate(data.settings);
					}
				}
			} catch (err) {
				console.error("Failed to fetch settings", err);
			}
		};

		void fetchSettings();
	}, [store]);

	return (
		<SettingsStoreContext.Provider value={store}>
			{children}
		</SettingsStoreContext.Provider>
	);
}

/**
 * Hook to consume the settings store.
 *
 * Usage:
 *   const currency = useSettingsStore((s) => s.currencySymbol);
 */
export const useSettingsStore = <T,>(
	selector: (state: SettingsState) => T,
): T => {
	const store = useContext(SettingsStoreContext);
	if (!store) throw new Error("Missing SettingsProvider in the component tree");
	return useStore(store, selector);
};
