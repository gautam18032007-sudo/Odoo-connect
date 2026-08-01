import { type NeonQueryFunction, neon } from "@neondatabase/serverless";

// Placeholder mock SQL executor when DATABASE_URL is missing
const mockSql = async (_strings: TemplateStringsArray, ..._values: any[]) => {
	console.warn("Neon DB not configured. Missing DATABASE_URL.");
	return [];
};
(mockSql as any).query = mockSql;
(mockSql as any).transaction = async () => [];

function createResilientSql(): NeonQueryFunction<false, false> {
	if (!process.env.DATABASE_URL) {
		return mockSql as unknown as NeonQueryFunction<false, false>;
	}

	const rawSql = neon(process.env.DATABASE_URL);

	const isConnectionTimeout = (error: any): boolean => {
		if (!error) return false;
		const msg = String(error?.message || "");
		const code = error?.code || error?.sourceError?.code;
		const causeCode = error?.sourceError?.cause?.code;
		return (
			msg.includes("fetch failed") ||
			msg.includes("timeout") ||
			code === "UND_ERR_CONNECT_TIMEOUT" ||
			causeCode === "UND_ERR_CONNECT_TIMEOUT" ||
			causeCode === "ConnectTimeoutError"
		);
	};

	const resilientSql = async (
		strings: TemplateStringsArray,
		...values: any[]
	) => {
		let attempts = 0;
		const maxAttempts = 3;
		while (attempts < maxAttempts) {
			try {
				return await rawSql(strings, ...values);
			} catch (error: any) {
				attempts++;
				if (isConnectionTimeout(error) && attempts < maxAttempts) {
					console.warn(
						`[Neon DB] Connection timeout (attempt ${attempts}/${maxAttempts}). Retrying in ${attempts * 300}ms...`,
					);
					await new Promise((resolve) => setTimeout(resolve, attempts * 300));
					continue;
				}
				throw error;
			}
		}
		return [];
	};

	(resilientSql as any).query = async (queryText: string, params?: any[]) => {
		let attempts = 0;
		const maxAttempts = 3;
		while (attempts < maxAttempts) {
			try {
				return await (rawSql as any).query(queryText, params);
			} catch (error: any) {
				attempts++;
				if (isConnectionTimeout(error) && attempts < maxAttempts) {
					console.warn(
						`[Neon DB] Query connection timeout (attempt ${attempts}/${maxAttempts}). Retrying in ${attempts * 300}ms...`,
					);
					await new Promise((resolve) => setTimeout(resolve, attempts * 300));
					continue;
				}
				throw error;
			}
		}
		return [];
	};

	(resilientSql as any).transaction = async (queries: any[]) => {
		return (rawSql as any).transaction(queries);
	};

	return resilientSql as unknown as NeonQueryFunction<false, false>;
}

export const sql = createResilientSql();
