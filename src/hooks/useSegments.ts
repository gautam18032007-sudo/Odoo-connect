import { useStabilizedDashboard } from "@/hooks/use-stabilized-dashboard";
import { useFilterStore } from "@/stores/founder/filter-store";

export function useSegments(hasData: boolean) {
	const { startDate, endDate, store, category, brand, sku, categoryScope } =
		useFilterStore();

	const fetcher = async (signal: AbortSignal) => {
		const params = new URLSearchParams({ startDate, endDate });
		if (store !== "ALL") params.set("store", store);
		if (category !== "All Categories") params.set("category", category);
		if (brand !== "All Brands") params.set("brand", brand);
		if (sku) params.set("sku", sku);
		if (categoryScope !== "all") params.set("categoryScope", categoryScope);

		const res = await fetch(
			`/api/customer-retention/segments?${params.toString()}`,
			{ signal },
		);
		const json = await res.json();
		if (json.success) {
			return json.data;
		}
		return null;
	};

	const { data, isInitialLoading } = useStabilizedDashboard({
		fetcher,
		enabled: hasData,
		dependencies: [
			hasData,
			startDate,
			endDate,
			store,
			category,
			brand,
			sku,
			categoryScope,
		],
	});

	return { data, isLoading: !data && isInitialLoading };
}
