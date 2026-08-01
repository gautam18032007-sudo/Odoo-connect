import { useFilterStore } from "@/stores/founder/filter-store";
import { useStabilizedDashboard } from "@/hooks/use-stabilized-dashboard";

export function useHealth(hasData: boolean) {
	const { startDate, endDate, store, categoryScope } = useFilterStore();

	const fetcher = async (signal: AbortSignal) => {
		const params = new URLSearchParams({ startDate, endDate });
		if (store !== "ALL") params.set("store", store);
		if (categoryScope !== "all") params.set("categoryScope", categoryScope);

		const res = await fetch(
			`/api/customer-retention/health?${params.toString()}`,
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
		dependencies: [hasData, startDate, endDate, store, categoryScope],
	});

	return { data, isLoading: !data && isInitialLoading };
}
