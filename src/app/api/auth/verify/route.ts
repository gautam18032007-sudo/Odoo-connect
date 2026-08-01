import { type NextRequest, NextResponse } from "next/server";

import { sql } from "@/lib/db";

export async function POST(req: NextRequest) {
	const { token } = await req.json();

	if (!token || typeof token !== "string") {
		return NextResponse.json({ ok: false }, { status: 401 });
	}

	const sessions = await sql`
    SELECT s.id
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${token}
      AND s.expires_at > NOW()
      AND u.is_active = true
    LIMIT 1
  `;

	if (sessions.length === 0) {
		return NextResponse.json({ ok: false }, { status: 401 });
	}

	return NextResponse.json({ ok: true });
}
