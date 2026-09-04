"use client";

import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

/**
 * A prior version of this component fabricated "Proposals Sent/Goal" from
 * billCuts * 0.08 (an unrelated sales metric) with hardcoded 379/12/18
 * fallbacks, and rendered a fully static fake "Upcoming Meetings" card with
 * a fictitious person and company. No genuine proposal-tracking or calendar
 * data source exists in this codebase — both have been removed rather than
 * replaced with another guess. This renders an honest "not connected" state
 * until a real source (a CRM proposal/deal-stage table, a calendar
 * integration) exists.
 */
export function TaskReminders() {
	return (
		<section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
			<Card className="xl:col-span-8">
				<CardHeader>
					<CardTitle>Upcoming Meetings</CardTitle>
					<CardAction>
						<Button variant="outline" size="sm" disabled>
							<CalendarDays data-icon="inline-start" />
							View Calendar
						</Button>
					</CardAction>
				</CardHeader>
				<CardContent>
					<div className="flex h-14 items-center justify-center text-sm text-muted-foreground">
						No calendar data connected
					</div>
				</CardContent>
			</Card>

			<Card className="xl:col-span-4">
				<CardHeader>
					<CardTitle>Monthly Proposal Goal</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-1">
					<div className="flex h-10 items-center text-2xl font-bold text-muted-foreground">
						N/A
					</div>
					<p className="text-muted-foreground text-sm">
						No proposal tracking source is connected yet.
					</p>
				</CardContent>
			</Card>
		</section>
	);
}
