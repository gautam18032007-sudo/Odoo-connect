import {
	AlertTriangle,
	HelpCircle,
	ShieldCheck,
	ShoppingBag,
	Tag,
	TrendingUp,
} from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export interface DiagnosisStore {
	name: string;
	billedBy: string;
	diagnosis: {
		type:
			| "FOOTFALL"
			| "BASKET"
			| "PRODUCT_MIX"
			| "PREMIUM_MIX"
			| "HEALTHY"
			| "STABLE";
		owner:
			| "MARKETING"
			| "MERCHANDISING"
			| "CATEGORY"
			| "OPERATIONS"
			| "STORE_OPS";
		message: string;
		priority: "LOW" | "MEDIUM" | "HIGH";
	};
}

export interface DiagnosisCardProps {
	stores: DiagnosisStore[];
}

export function DiagnosisCard({ stores }: DiagnosisCardProps) {
	// Filter out stable store diagnoses so we focus on actionable alerts, or show all if there are no major issues.
	const activeAlerts = React.useMemo(() => {
		return stores.filter((s) => s.diagnosis.type !== "STABLE");
	}, [stores]);

	const getDiagnosisIcon = (type: string) => {
		switch (type) {
			case "FOOTFALL":
				return <ShoppingBag className="size-4 text-rose-500" />;
			case "BASKET":
				return <Tag className="size-4 text-amber-500" />;
			case "PRODUCT_MIX":
				return <AlertTriangle className="size-4 text-purple-500" />;
			case "PREMIUM_MIX":
				return <TrendingUp className="size-4 text-emerald-500" />;
			case "HEALTHY":
				return <ShieldCheck className="size-4 text-emerald-500" />;
			default:
				return <HelpCircle className="size-4 text-muted-foreground" />;
		}
	};

	const getOwnerColor = (owner: string) => {
		switch (owner) {
			case "MARKETING":
				return "bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-500/10";
			case "MERCHANDISING":
				return "bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10";
			case "CATEGORY":
				return "bg-purple-500/10 text-purple-700 dark:text-purple-400 hover:bg-purple-500/10";
			case "OPERATIONS":
				return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10";
			default:
				return "bg-muted text-muted-foreground hover:bg-muted";
		}
	};

	const getPriorityBadge = (priority: string) => {
		switch (priority) {
			case "HIGH":
				return (
					<Badge
						variant="secondary"
						className="bg-rose-500/10 text-rose-600 hover:bg-rose-500/10 border-none px-1.5 py-0.5 rounded-sm text-[9px] font-bold"
					>
						High Priority
					</Badge>
				);
			case "MEDIUM":
				return (
					<Badge
						variant="secondary"
						className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/10 border-none px-1.5 py-0.5 rounded-sm text-[9px] font-bold"
					>
						Medium Priority
					</Badge>
				);
			default:
				return (
					<Badge
						variant="secondary"
						className="bg-muted text-muted-foreground hover:bg-muted border-none px-1.5 py-0.5 rounded-sm text-[9px] font-bold"
					>
						Info
					</Badge>
				);
		}
	};

	return (
		<Card className="h-full">
			<CardHeader className="flex flex-col gap-1 pb-3">
				<CardTitle className="text-lg font-bold">
					Store Diagnosis Engine
				</CardTitle>
				<CardDescription className="text-xs text-muted-foreground">
					Automated analysis identifying root causes behind performance changes.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				{activeAlerts.length === 0 ? (
					<div className="bg-emerald-500/5 border-emerald-500/10 flex flex-col items-center justify-center rounded-lg border p-6 text-center">
						<ShieldCheck className="size-8 text-emerald-500 mb-2" />
						<h3 className="font-semibold text-sm text-foreground mb-1">
							Operational Health Excellent
						</h3>
						<p className="text-muted-foreground text-xs max-w-sm">
							All stores are performing within stable or positive variances. No
							operational issues detected.
						</p>
					</div>
				) : (
					<div className="space-y-3">
						{activeAlerts.map((store) => {
							const diag = store.diagnosis;
							return (
								<div
									key={store.billedBy}
									className="border-border/60 hover:border-border flex flex-col gap-2 rounded-lg border p-3.5 transition-colors"
								>
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-2">
											{getDiagnosisIcon(diag.type)}
											<span className="font-semibold text-foreground text-xs">
												{store.name}
											</span>
										</div>
										<div className="flex items-center gap-1.5">
											{getPriorityBadge(diag.priority)}
											<Badge
												variant="secondary"
												className={`border-none px-1.5 py-0.5 rounded-sm text-[9px] font-semibold ${getOwnerColor(
													diag.owner,
												)}`}
											>
												Owner: {diag.owner}
											</Badge>
										</div>
									</div>
									<p className="text-muted-foreground text-xs leading-relaxed pl-6">
										{diag.message}
									</p>
								</div>
							);
						})}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
