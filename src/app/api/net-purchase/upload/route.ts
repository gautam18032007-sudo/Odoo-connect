import { NextResponse } from "next/server";

export async function POST() {
	return NextResponse.json(
		{
			success: false,
			deprecated: true,
			error:
				"Net Purchase Excel upload has been deprecated. Live purchase transactions are synchronized automatically from Odoo SaaS.",
		},
		{ status: 410 },
	);
}

export async function GET() {
	return NextResponse.json(
		{
			success: false,
			deprecated: true,
			message: "Net Purchase Excel upload has been deprecated.",
		},
		{ status: 410 },
	);
}
