import { NextResponse } from "next/server";
import { clearSessionCookie, deleteSession, getSessionToken } from "@/lib/auth";

export async function POST() {
	try {
		const token = await getSessionToken();
		if (token) {
			await deleteSession(token);
		}
		await clearSessionCookie();

		return NextResponse.json({ success: true, redirect: "/login" });
	} catch (error: any) {
		console.error("Logout error:", error);
		// Even on error, clear the cookie
		await clearSessionCookie();
		return NextResponse.json({ success: true, redirect: "/login" });
	}
}
