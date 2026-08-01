import { NextResponse } from "next/server";

export async function POST() {
	return NextResponse.json(
		{
			success: false,
			deprecated: true,
			error:
				"Excel import pipeline has been deprecated. ZenZebra CRM now syncs real-time data directly from Odoo SaaS PostgreSQL.",
		},
		{ status: 410 },
	);
}

export async function GET() {
	return NextResponse.json(
		{
			success: false,
			deprecated: true,
			message:
				"Excel import pipeline has been deprecated. Live synchronization is managed via Odoo background worker.",
		},
		{ status: 410 },
	);
}
