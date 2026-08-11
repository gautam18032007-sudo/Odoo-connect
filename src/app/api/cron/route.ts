import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
	const authHeader = req.headers.get("Authorization");
	const cronSecret = process.env.CRON_SECRET;

	if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
	return GET(req);
}
