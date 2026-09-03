import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { NextRequest } from "next/server";
import { GET as getDashboard } from "../../app/api/sales/dashboard/route";
import { GET as getDashboardExtended } from "../../app/api/sales/dashboard-extended/route";
import { GET as getStatus } from "../../app/api/sales/status/route";

async function main() {
	console.log("--- Testing API Endpoints ---");

	// 1. Status API
	try {
		console.log("\n1. Testing GET /api/sales/status...");
		const res = await getStatus();
		const json = await res.json();
		console.log("   Status:", res.status);
		console.log("   Success:", json.success);
		if (json.success) {
			console.log("   Available Stores:", json.data.availableStores);
		} else {
			console.error("   Error:", json.error);
		}
	} catch (err) {
		console.error("   Error calling Status API:", err);
	}

	// 2. Dashboard API
	try {
		console.log("\n2. Testing GET /api/sales/dashboard...");
		const req = new NextRequest(
			"http://localhost:3000/api/sales/dashboard?startDate=2026-05-25&endDate=2026-06-23",
		);
		const res = await getDashboard(req);
		const json = await res.json();
		console.log("   Status:", res.status);
		console.log("   Success:", json.success);
		if (json.success) {
			console.log(
				"   Revenue KPI (current):",
				json.data.salesKpis?.revenue?.current,
			);
		} else {
			console.error("   Error:", json.error);
		}
	} catch (err) {
		console.error("   Error calling Dashboard API:", err);
	}

	// 3. Dashboard Extended API
	try {
		console.log("\n3. Testing GET /api/sales/dashboard-extended...");
		const req = new NextRequest(
			"http://localhost:3000/api/sales/dashboard-extended?startDate=2026-05-25&endDate=2026-06-23",
		);
		const res = await getDashboardExtended(req);
		const json = await res.json();
		console.log("   Status:", res.status);
		console.log("   Success:", json.success);
		if (json.success) {
			console.log(
				"   Store Performance Count:",
				json.data.storePerformance?.length,
			);
			console.log("   Daily Trends Count:", json.data.dailyTrends?.length);
		} else {
			console.error("   Error:", json.error);
		}
	} catch (err) {
		console.error("   Error calling Dashboard Extended API:", err);
	}
}

main();
