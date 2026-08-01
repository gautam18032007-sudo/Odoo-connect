"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

interface StoreFilterProps {
	currentStore: string;
}

export function StoreFilter({ currentStore }: StoreFilterProps) {
	const router = useRouter();
	const searchParams = useSearchParams();

	return (
		<div className="flex items-center gap-3">
			<span className="text-xs text-zinc-500 font-mono">Store:</span>
			<Select
				value={currentStore || "ALL"}
				onValueChange={(val) => {
					const params = new URLSearchParams(searchParams.toString());
					if (val === "ALL") {
						params.delete("store");
					} else {
						params.set("store", val);
					}
					router.push(`?${params.toString()}`);
				}}
			>
				<SelectTrigger className="w-[180px] bg-zinc-950 border-[0.5px] border-zinc-800 text-xs text-zinc-100 rounded-[12px] h-9 focus:ring-0 focus:ring-offset-0">
					<SelectValue placeholder="All Stores" />
				</SelectTrigger>
				<SelectContent className="bg-zinc-950 border-[0.5px] border-zinc-800 text-zinc-100 rounded-[12px] shadow-none">
					<SelectItem value="ALL">All Stores</SelectItem>
					<SelectItem value="SmartworksNoida Noida">
						Smart Works Noida
					</SelectItem>
					<SelectItem value="Klj store">KLJ Store</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
