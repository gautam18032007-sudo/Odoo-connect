import { revalidatePath, revalidateTag } from "next/cache";

export interface RevalidateOptions {
	tags?: string[];
	paths?: string[];
}

/**
 * Revalidates Next.js Data Cache tags and paths for real-time dashboard updates.
 */
export async function invalidateDashboardCache(
	options: RevalidateOptions = {},
): Promise<{
	success: boolean;
	invalidatedTags: string[];
	invalidatedPaths: string[];
}> {
	const defaultTags = ["dashboard", "sales", "customer", "store", "inventory"];
	const defaultPaths = ["/dashboard"];

	const tagsToInvalidate = options.tags?.length ? options.tags : defaultTags;
	const pathsToInvalidate = options.paths?.length
		? options.paths
		: defaultPaths;

	for (const tag of tagsToInvalidate) {
		try {
			revalidateTag(tag, "default");
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (msg.includes("static generation store missing")) {
				console.log(
					`[revalidate] Background context: tag '${tag}' invalidation deferred to client poll/refetch`,
				);
			} else {
				console.warn(
					`[revalidate] Tag invalidation warning for '${tag}':`,
					msg,
				);
			}
		}
	}

	for (const pathStr of pathsToInvalidate) {
		try {
			revalidatePath(pathStr);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (msg.includes("static generation store missing")) {
				console.log(
					`[revalidate] Background context: path '${pathStr}' invalidation deferred to client poll/refetch`,
				);
			} else {
				console.warn(
					`[revalidate] Path invalidation warning for '${pathStr}':`,
					msg,
				);
			}
		}
	}

	return {
		success: true,
		invalidatedTags: tagsToInvalidate,
		invalidatedPaths: pathsToInvalidate,
	};
}
