"use client";

import { Building2, MoreHorizontal, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/lib/utils";

export interface PipelineLead {
	id: number | string;
	name: string;
	partnerName?: string;
	phone?: string;
	email?: string;
	stage: string;
	expectedRevenue: number;
	store?: string;
	health?: string;
	salesperson?: string;
}

interface PipelineKanbanBoardProps {
	leads: PipelineLead[];
	onStageChange: (leadId: number | string, newStage: string) => void;
}

const STAGES = [
	{
		id: "Qualified",
		title: "Qualified Leads",
		color: "border-l-blue-500",
		bg: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
	},
	{
		id: "Discovery",
		title: "Discovery Phase",
		color: "border-l-amber-500",
		bg: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
	},
	{
		id: "Proposal Sent",
		title: "Proposal Sent",
		color: "border-l-purple-500",
		bg: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
	},
	{
		id: "Negotiation",
		title: "Negotiation",
		color: "border-l-indigo-500",
		bg: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
	},
	{
		id: "Closed Won",
		title: "Closed Won",
		color: "border-l-emerald-500",
		bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	},
];

export function PipelineKanbanBoard({
	leads,
	onStageChange,
}: PipelineKanbanBoardProps) {
	const getLeadsByStage = (stageId: string) => {
		return leads.filter((l) => l.stage === stageId);
	};

	return (
		<div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 overflow-x-auto pb-4">
			{STAGES.map((stage) => {
				const stageLeads = getLeadsByStage(stage.id);
				const stageTotalValue = stageLeads.reduce(
					(sum, item) => sum + (item.expectedRevenue || 0),
					0,
				);

				return (
					<div
						key={stage.id}
						className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-3 min-w-[260px]"
					>
						<div className="flex items-center justify-between px-1">
							<div className="flex items-center gap-2">
								<span
									className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${stage.bg}`}
								>
									{stage.title}
								</span>
								<span className="text-xs text-muted-foreground font-mono font-medium">
									({stageLeads.length})
								</span>
							</div>
							<span className="text-xs font-mono font-semibold text-foreground">
								{formatCurrency(stageTotalValue)}
							</span>
						</div>

						<div className="flex flex-col gap-2.5 min-h-[300px]">
							{stageLeads.length > 0 ? (
								stageLeads.map((lead) => (
									<Card
										key={lead.id}
										className={`relative border-l-4 ${stage.color} hover:shadow-md transition-shadow bg-card`}
									>
										<CardContent className="p-3 flex flex-col gap-2">
											<div className="flex items-start justify-between gap-2">
												<div>
													<h4 className="font-semibold text-sm line-clamp-1 leading-snug">
														{lead.name}
													</h4>
													{lead.partnerName && (
														<div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
															<Building2 className="size-3 shrink-0" />
															<span className="truncate">
																{lead.partnerName}
															</span>
														</div>
													)}
												</div>

												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															variant="ghost"
															size="icon-xs"
															className="h-6 w-6 shrink-0"
														>
															<MoreHorizontal className="size-3.5" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end" className="w-44">
														<div className="px-2 py-1 text-[11px] font-semibold uppercase text-muted-foreground">
															Move to Stage
														</div>
														{STAGES.map((s) => (
															<DropdownMenuItem
																key={s.id}
																disabled={s.id === lead.stage}
																onClick={() => onStageChange(lead.id, s.id)}
																className="text-xs cursor-pointer"
															>
																{s.title}
															</DropdownMenuItem>
														))}
													</DropdownMenuContent>
												</DropdownMenu>
											</div>

											<div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
												<div className="font-mono font-semibold text-foreground text-xs">
													{formatCurrency(lead.expectedRevenue)}
												</div>

												<Badge
													variant="outline"
													className={`text-[10px] px-1.5 py-0 ${
														lead.store
															? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
															: "border-muted-foreground/30 text-muted-foreground"
													}`}
												>
													{lead.store || "Unknown"}
												</Badge>
											</div>

											{lead.phone && (
												<div className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
													<Phone className="size-3 text-muted-foreground" />
													<span>{lead.phone}</span>
												</div>
											)}
										</CardContent>
									</Card>
								))
							) : (
								<div className="flex flex-col items-center justify-center h-28 rounded-lg border border-dashed border-border/60 text-center p-3">
									<p className="text-xs text-muted-foreground">
										No deals in stage
									</p>
								</div>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}
