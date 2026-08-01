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
			console.warn(`[revalidate] Tag invalidation warning for '${tag}':`, err);
		}
	}

	for (const pathStr of pathsToInvalidate) {
		try {
			revalidatePath(pathStr);
		} catch (err) {
			console.warn(
				`[revalidate] Path invalidation warning for '${pathStr}':`,
				err,
			);
		}
	}

	return {
		success: true,
		invalidatedTags: tagsToInvalidate,
		invalidatedPaths: pathsToInvalidate,
	};
}
