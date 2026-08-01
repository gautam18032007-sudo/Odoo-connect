export function getComparisonPeriod(
	startDateStr: string,
	endDateStr: string,
): { priorStart: string; priorEnd: string; label: string } {
	// Parse inputs (assume YYYY-MM-DD local timezone context isn't strict, but UTC is safer for simple math)
	const start = new Date(startDateStr);
	const end = new Date(endDateStr);
	const diffDays =
		Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

	// Helpers
	const toISODate = (d: Date) => d.toISOString().split("T")[0];

	let priorStart: Date;
	let priorEnd: Date;
	let label = "vs prior period";

	if (diffDays === 1) {
		// Today -> Yesterday, Yesterday -> The day before yesterday
		priorStart = new Date(start);
		priorStart.setDate(priorStart.getDate() - 1);
		priorEnd = new Date(end);
		priorEnd.setDate(priorEnd.getDate() - 1);
	} else if (diffDays === 7) {
		// Last 7 days -> The 7 days before that
		priorStart = new Date(start);
		priorStart.setDate(priorStart.getDate() - 7);
		priorEnd = new Date(end);
		priorEnd.setDate(priorEnd.getDate() - 7);
	} else if (diffDays >= 28 && diffDays <= 31 && start.getDate() === 1) {
		// Month logic: "Same month, prior year"
		// Check if it's exactly a full month
		const nextMonth = new Date(start);
		nextMonth.setMonth(nextMonth.getMonth() + 1);
		nextMonth.setDate(0); // Last day of start's month

		if (end.getDate() === nextMonth.getDate()) {
			priorStart = new Date(start);
			priorStart.setFullYear(priorStart.getFullYear() - 1);
			priorEnd = new Date(end);
			priorEnd.setFullYear(priorEnd.getFullYear() - 1);
			// fix leap year issue
			if (priorEnd.getMonth() !== priorStart.getMonth()) {
				priorEnd.setDate(0); // go back to last day of proper month
			}
			label = "vs last year";
		} else {
			// Custom Range fallback
			priorStart = new Date(start);
			priorStart.setDate(priorStart.getDate() - diffDays);
			priorEnd = new Date(end);
			priorEnd.setDate(priorEnd.getDate() - diffDays);
		}
	} else {
		// Custom Range (N days) -> The N days immediately before the start date
		priorStart = new Date(start);
		priorStart.setDate(priorStart.getDate() - diffDays);
		priorEnd = new Date(end);
		priorEnd.setDate(priorEnd.getDate() - diffDays);
	}

	return {
		priorStart: toISODate(priorStart),
		priorEnd: toISODate(priorEnd),
		label,
	};
}
