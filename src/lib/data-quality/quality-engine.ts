/**
 * ZenZebra CRM Data Quality Engine
 * Computes completeness, duplicate count, accuracy score, and overall confidence score before import commit.
 */

export interface DataQualityReport {
	totalRows: number;
	validRows: number;
	duplicateRows: number;
	missingValueRows: number;
	invalidFormatRows: number;
	completenessScorePercent: number;
	accuracyScorePercent: number;
	overallConfidenceScore: number;
	status: "PASSED" | "NEEDS_REVIEW" | "REJECTED";
}

export function evaluateDataQuality(
	rows: Array<Record<string, any>>,
): DataQualityReport {
	if (!rows || rows.length === 0) {
		return {
			totalRows: 0,
			validRows: 0,
			duplicateRows: 0,
			missingValueRows: 0,
			invalidFormatRows: 0,
			completenessScorePercent: 0,
			accuracyScorePercent: 0,
			overallConfidenceScore: 0,
			status: "REJECTED",
		};
	}

	const totalRows = rows.length;
	let missingValues = 0;
	let invalidFormats = 0;
	const seenBillNos = new Set<string>();
	let duplicateRows = 0;

	for (const row of rows) {
		// Required check: bill_no, net_amount, sale_date
		if (!row.bill_no || !row.net_amount || !row.sale_date) {
			missingValues++;
		}

		if (row.net_amount !== undefined && Number.isNaN(Number(row.net_amount))) {
			invalidFormats++;
		}

		if (row.bill_no) {
			if (seenBillNos.has(String(row.bill_no))) {
				duplicateRows++;
			} else {
				seenBillNos.add(String(row.bill_no));
			}
		}
	}

	const validRows =
		totalRows - (missingValues + invalidFormats + duplicateRows);
	const completenessScorePercent = Number(
		(((totalRows - missingValues) / totalRows) * 100).toFixed(1),
	);
	const accuracyScorePercent = Number(
		(((totalRows - invalidFormats) / totalRows) * 100).toFixed(1),
	);
	const overallConfidenceScore = Number(
		((validRows / totalRows) * 100).toFixed(1),
	);

	let status: DataQualityReport["status"] = "PASSED";
	if (overallConfidenceScore < 70) {
		status = "REJECTED";
	} else if (overallConfidenceScore < 90) {
		status = "NEEDS_REVIEW";
	}

	return {
		totalRows,
		validRows: Math.max(0, validRows),
		duplicateRows,
		missingValueRows: missingValues,
		invalidFormatRows: invalidFormats,
		completenessScorePercent,
		accuracyScorePercent,
		overallConfidenceScore,
		status,
	};
}
