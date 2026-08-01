import { type NextRequest, NextResponse } from "next/server";
import { getFinanceSummary } from "@/lib/repositories/finance.repository";

export async function GET(_req: NextRequest) {
	try {
		const summary = await getFinanceSummary();
		return NextResponse.json({ success: true, data: summary });
	} catch (err: any) {
		console.error("Failed to fetch finance summary:", err);
		return NextResponse.json(
			{
				success: false,
				error: err.message || "Failed to fetch finance summary",
			},
			{ status: 500 },
		);
	}
}
