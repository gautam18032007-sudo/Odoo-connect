/**
 * ZenZebra CRM Role-Based Access Control (RBAC) & Permission Matrix
 */

export type UserRole = "Founder" | "Manager" | "Sales" | "Viewer";

export type ResourceAction =
	| "lead:upload"
	| "lead:create"
	| "lead:update_stage"
	| "lead:delete"
	| "finance:view"
	| "analytics:view_all"
	| "analytics:export"
	| "settings:manage";

const PERMISSION_MATRIX: Record<UserRole, Set<ResourceAction>> = {
	Founder: new Set([
		"lead:upload",
		"lead:create",
		"lead:update_stage",
		"lead:delete",
		"finance:view",
		"analytics:view_all",
		"analytics:export",
		"settings:manage",
	]),
	Manager: new Set([
		"lead:upload",
		"lead:create",
		"lead:update_stage",
		"finance:view",
		"analytics:view_all",
		"analytics:export",
	]),
	Sales: new Set(["lead:create", "lead:update_stage", "analytics:export"]),
	Viewer: new Set(["analytics:export"]),
};

export function hasPermission(role: UserRole, action: ResourceAction): boolean {
	const permissions = PERMISSION_MATRIX[role];
	return permissions ? permissions.has(action) : false;
}

export function enforcePermission(
	role: UserRole,
	action: ResourceAction,
): void {
	if (!hasPermission(role, action)) {
		throw new Error(
			`Forbidden: Role '${role}' lacks permission for action '${action}'`,
		);
	}
}
