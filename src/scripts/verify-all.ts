import { spawnSync } from "node:child_process";
import path from "node:path";

/**
 * ZZ Dashboard release gate. Runs every verification suite and prints a single
 * PASS/FAIL summary. Use before every deployment:
 *
 *   npm run verify
 *
 * Exit code is non-zero if any suite fails, so it can gate CI/CD.
 */

interface Suite {
	name: string;
	script: string;
}

// Order: correctness first, infra + performance last.
// Extend as Inventory / Finance / API-contract suites are built.
const SUITES: Suite[] = [
	{
		name: "Regression Verification",
		script: "src/scripts/verify-regression.ts",
	},
	{ name: "Stores (Live)", script: "src/scripts/verify-stores.ts" },
	{
		name: "Customer Intelligence (Live)",
		script: "src/scripts/verify-customer-intelligence.ts",
	},
	{
		name: "Data Platform (Live)",
		script: "src/scripts/verify-data-platform.ts",
	},
	{
		name: "Profitability (Live)",
		script: "src/scripts/verify-profitability.ts",
	},
	{
		name: "Net Purchase (Live)",
		script: "src/scripts/verify-net-purchase.ts",
	},
	{ name: "Performance (Live)", script: "src/scripts/verify-performance.ts" },
];

function run(script: string): { ok: boolean; ms: number } {
	const t0 = performance.now();
	const res = spawnSync(
		"npx",
		[
			"ts-node",
			"-P",
			"tsconfig.scripts.json",
			path.resolve(process.cwd(), script),
		],
		{ stdio: "inherit", env: process.env, shell: process.platform === "win32" },
	);
	return { ok: res.status === 0, ms: performance.now() - t0 };
}

function main() {
	console.log("═══════════════════════════════════════════");
	console.log("  ZZ Dashboard — Release Verification");
	console.log("═══════════════════════════════════════════\n");

	const results: Array<{ name: string; ok: boolean; ms: number }> = [];
	for (const suite of SUITES) {
		console.log(`\n▶ ${suite.name}\n${"-".repeat(43)}`);
		const { ok, ms } = run(suite.script);
		results.push({ name: suite.name, ok, ms });
	}

	console.log("\n═══════════════════════════════════════════");
	console.log("  Verification Summary");
	console.log("═══════════════════════════════════════════");
	for (const r of results) {
		console.log(
			`  ${r.ok ? "✅ PASS" : "❌ FAIL"}  ${r.name.padEnd(24)} ${(r.ms / 1000).toFixed(1)}s`,
		);
	}
	const allOk = results.every((r) => r.ok);
	console.log("───────────────────────────────────────────");
	console.log(
		`  Overall: ${allOk ? "✅ PASS — safe to deploy" : "❌ FAIL — do not deploy"}`,
	);
	console.log("═══════════════════════════════════════════");

	if (!allOk) process.exit(1);
}

main();
