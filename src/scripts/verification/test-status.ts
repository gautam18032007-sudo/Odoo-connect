import { NextRequest } from "next/server";
import { GET } from "../../app/api/sales/status/route";

async function main() {
	const req = new NextRequest("http://localhost:3000/api/sales/status");
	const res = await GET();
	console.log("Status:", res.status);
	console.log("Result:", await res.json());
}
main().catch(console.error);
