import * as path from "node:path";
import * as dotenv from "dotenv";
import { OdooClient } from "../lib/odoo/client";
import {
	acquireReconciliationLock,
	releaseReconciliationLock,
	runAcceptanceGates,
	runCatchupSweep,
	runSimulationAudit,
	runWindowedReconciliation,
} from "../lib/odoo/sync/reconciliation";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
	console.log("==================================================");
	console.log("⚡ ZenZebra Enterprise Odoo 19 Historical Reconciler");
	console.log("==================================================");

	const args = process.argv.slice(2);
	const isSimulate = args.includes("--simulate") || args.includes("--dry-run");
	const isExecute = args.includes("--execute");
	const isResume = args.includes("--resume");
	const isVerifyOnly = args.includes("--verify-only");

	let windowDays = 7;
	const windowDaysIdx = args.indexOf("--window-days");
	if (windowDaysIdx !== -1 && args[windowDaysIdx + 1]) {
		windowDays = Number(args[windowDaysIdx + 1]) || 7;
	}

	let endDate: string | undefined;
	const endDateIdx = args.indexOf("--end-date");
	if (endDateIdx !== -1 && args[endDateIdx + 1]) {
		endDate = args[endDateIdx + 1];
	}

	let entity: string | undefined;
	const entityIdx = args.indexOf("--entity");
	if (entityIdx !== -1 && args[entityIdx + 1]) {
		entity = args[entityIdx + 1];
	}

	let gates: string[] | undefined;
	const gatesIdx = args.indexOf("--gates");
	if (gatesIdx !== -1 && args[gatesIdx + 1]) {
		gates = args[gatesIdx + 1].split(",").map((g) => g.trim());
	}

	const client = new OdooClient();
	if (client.getMockModeStatus()) {
		console.log(
			"ℹ️ Operating in [Mock Validation Mode]. Set Odoo parameters in .env.local for live endpoint.",
		);
	} else {
		console.log("🔒 Connecting to Live Odoo 19 SaaS Instance...");
	}

	if (isVerifyOnly) {
		console.log("\n📋 Running Verification & Acceptance Gates Only...");
		const gateResults = await runAcceptanceGates(gates);
		console.table(gateResults);
		process.exit(0);
	}

	if (isSimulate || (!isExecute && !isResume)) {
		console.log("\n🧪 Running Pre-Flight Simulation / Audit Mode...");
		const auditResults = await runSimulationAudit(client);
		console.table(auditResults);
		console.log(
			"\n💡 To execute reconciliation, run with `--execute` or `--resume`.",
		);
		process.exit(0);
	}

	// Execution or Resume Mode
	const lockAcquired = await acquireReconciliationLock();
	if (!lockAcquired) {
		console.error(
			"❌ Execution aborted: Active Reconciliation Lock held by another worker.",
		);
		process.exit(1);
	}

	try {
		const mode = isResume ? "resume" : "execute";
		const { logs, initialWatermark } = await runWindowedReconciliation(client, {
			mode,
			windowDays,
			endDate,
			entity,
			gates,
		});

		console.log("\n📊 Reconciliation Window Logs Summary:");
		console.table(logs);

		// Catch-up sweep from initial watermark
		await runCatchupSweep(client, initialWatermark);

		// Run final acceptance gates
		const gateResults = await runAcceptanceGates(gates);
		console.log("\n🚦 Final Production Acceptance Gate Results:");
		console.table(gateResults);

		const allPassed = gateResults.every((g) => g.status === "PASS");
		if (allPassed) {
			console.log("\n==================================================");
			console.log("✅ Enterprise Reconciliation Completed Successfully!");
			console.log("==================================================");
		} else {
			console.warn(
				"\n⚠️ Reconciliation finished with warnings on some acceptance gates.",
			);
		}
	} catch (err: any) {
		console.error("\n❌ Reconciliation execution failed:", err.message || err);
	} finally {
		await releaseReconciliationLock();
	}
}

main();
