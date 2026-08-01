import { NextResponse } from "next/server";

export interface ApiMeta {
	requestId: string;
	executionTimeMs: number;
	timestamp: string;
	version: string;
}

export interface ApiResponse<T = any> {
	success: boolean;
	data?: T;
	meta: ApiMeta;
	errors: Array<{ code: string; message: string }>;
}

export function createApiResponse<T>(
	data: T,
	meta: { requestId: string; startTime: number; version?: string },
	status = 200,
): NextResponse<ApiResponse<T>> {
	const executionTimeMs = Number(
		(performance.now() - meta.startTime).toFixed(2),
	);
	const payload: ApiResponse<T> = {
		success: true,
		data,
		meta: {
			requestId: meta.requestId,
			executionTimeMs,
			timestamp: new Date().toISOString(),
			version: meta.version || "v1.0",
		},
		errors: [],
	};
	return NextResponse.json(payload, { status });
}

export function createApiErrorResponse(
	errors: Array<{ code: string; message: string }> | string,
	meta: { requestId: string; startTime: number },
	status = 500,
): NextResponse<ApiResponse<null>> {
	const executionTimeMs = Number(
		(performance.now() - meta.startTime).toFixed(2),
	);
	const errorList =
		typeof errors === "string"
			? [{ code: "INTERNAL_ERROR", message: errors }]
			: errors;

	const payload: ApiResponse<null> = {
		success: false,
		data: null,
		meta: {
			requestId: meta.requestId,
			executionTimeMs,
			timestamp: new Date().toISOString(),
			version: "v1.0",
		},
		errors: errorList,
	};
	return NextResponse.json(payload, { status });
}
