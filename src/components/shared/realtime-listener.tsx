"use client";

import { useRealtimeFreshness } from "@/hooks/use-realtime-freshness";

export function RealtimeListener() {
	useRealtimeFreshness({ intervalMs: 5000, enabled: true });
	return null;
}
