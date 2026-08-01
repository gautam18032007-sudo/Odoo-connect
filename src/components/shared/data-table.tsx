"use client";

import {
	ChevronDown,
	ChevronsUpDown,
	ChevronUp,
	Inbox,
	Search,
} from "lucide-react";
import type * as React from "react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { tokens } from "@/styles/tokens";

export interface Column<T> {
	key: string;
	header: string;
	accessor: (item: T) => React.ReactNode;
	sortable?: boolean;
	sortValue?: (item: T) => string | number;
	className?: string;
}

interface DataTableProps<T> {
	data: T[];
	columns: Column<T>[];
	searchPlaceholder?: string;
	searchKey?: (item: T) => string;
	emptyTitle?: string;
	emptyDescription?: string;
	className?: string;
	pageSize?: number;
}

export function DataTable<T>({
	data,
	columns,
	searchPlaceholder = "Search records...",
	searchKey,
	emptyTitle = "No data available",
	emptyDescription = "No records match your filter criteria.",
	className,
	pageSize = 10,
}: DataTableProps<T>) {
	const [query, setQuery] = useState("");
	const [sortColumn, setSortColumn] = useState<string | null>(null);
	const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
	const [page, setPage] = useState(1);

	// Filtered data
	const filteredData = useMemo(() => {
		if (!query || !searchKey) return data;
		const q = query.toLowerCase();
		return data.filter((item) => searchKey(item).toLowerCase().includes(q));
	}, [data, query, searchKey]);

	// Sorted data
	const sortedData = useMemo(() => {
		if (!sortColumn) return filteredData;
		const col = columns.find((c) => c.key === sortColumn);
		if (!col?.sortValue) return filteredData;

		const getValue = col.sortValue;
		return [...filteredData].sort((a, b) => {
			const valA = getValue(a);
			const valB = getValue(b);

			if (valA < valB) return sortDirection === "asc" ? -1 : 1;
			if (valA > valB) return sortDirection === "asc" ? 1 : -1;
			return 0;
		});
	}, [filteredData, sortColumn, sortDirection, columns]);

	// Paginated data
	const totalPages = Math.ceil(sortedData.length / pageSize);
	const paginatedData = useMemo(() => {
		const start = (page - 1) * pageSize;
		return sortedData.slice(start, start + pageSize);
	}, [sortedData, page, pageSize]);

	const handleSort = (colKey: string, sortable?: boolean) => {
		if (!sortable) return;
		if (sortColumn === colKey) {
			if (sortDirection === "asc") setSortDirection("desc");
			else setSortColumn(null);
		} else {
			setSortColumn(colKey);
			setSortDirection("asc");
		}
	};

	return (
		<div
			className={cn(
				tokens.effects.cardBase,
				"flex flex-col gap-4 p-5",
				className,
			)}
		>
			{searchKey && (
				<div className="relative max-w-sm">
					<Search className="absolute left-3 top-2.5 size-4 text-zinc-500" />
					<Input
						placeholder={searchPlaceholder}
						value={query}
						onChange={(e) => {
							setQuery(e.target.value);
							setPage(1);
						}}
						className="pl-9 bg-zinc-900/50 border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-500"
					/>
				</div>
			)}

			<div className="overflow-hidden rounded-xl border border-zinc-800/80">
				<Table>
					<TableHeader className="bg-zinc-900/80">
						<TableRow className="border-zinc-800 hover:bg-transparent">
							{columns.map((col) => (
								<TableHead
									key={col.key}
									onClick={() => handleSort(col.key, col.sortable)}
									className={cn(
										"text-xs font-semibold text-zinc-400 py-3 uppercase tracking-wider",
										col.sortable &&
											"cursor-pointer select-none hover:text-zinc-200",
										col.className,
									)}
								>
									<div className="flex items-center gap-1.5">
										{col.header}
										{col.sortable && (
											<span className="text-zinc-500">
												{sortColumn === col.key ? (
													sortDirection === "asc" ? (
														<ChevronUp className="size-3 text-emerald-400" />
													) : (
														<ChevronDown className="size-3 text-emerald-400" />
													)
												) : (
													<ChevronsUpDown className="size-3 opacity-50" />
												)}
											</span>
										)}
									</div>
								</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{paginatedData.length > 0 ? (
							paginatedData.map((item, idx) => (
								<TableRow
									key={idx}
									className="border-zinc-800/60 hover:bg-white/[0.02] transition-colors"
								>
									{columns.map((col) => (
										<TableCell
											key={col.key}
											className={cn(
												"py-3 text-xs text-zinc-300",
												col.className,
											)}
										>
											{col.accessor(item)}
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={columns.length}
									className="h-40 text-center"
								>
									<div className="flex flex-col items-center justify-center gap-2 text-zinc-500">
										<Inbox className="size-8 opacity-50" />
										<p className="text-sm font-medium text-zinc-400">
											{emptyTitle}
										</p>
										<p className="text-xs text-zinc-500">{emptyDescription}</p>
									</div>
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			{totalPages > 1 && (
				<div className="flex items-center justify-between pt-2 text-xs text-zinc-400">
					<span>
						Showing {(page - 1) * pageSize + 1} to{" "}
						{Math.min(page * pageSize, sortedData.length)} of{" "}
						{sortedData.length} records
					</span>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => setPage((p) => Math.max(p - 1, 1))}
							disabled={page === 1}
							className="px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors"
						>
							Previous
						</button>
						<span className="font-mono">
							{page} / {totalPages}
						</span>
						<button
							type="button"
							onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
							disabled={page === totalPages}
							className="px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors"
						>
							Next
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
