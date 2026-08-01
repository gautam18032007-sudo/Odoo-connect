import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
	try {
		const user = await getCurrentUser();
		if (!user) {
			return NextResponse.json({ user: null }, { status: 401 });
		}
		return NextResponse.json({ user });
	} catch (error: any) {
		console.error("Auth me error:", error);
		return NextResponse.json({ user: null }, { status: 401 });
	}
}
