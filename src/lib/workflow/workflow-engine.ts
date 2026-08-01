/**
 * ZenZebra CRM Configurable Workflow Engine
 * Manages state transition validation, next allowed states, rules, and event side-effects.
 */

export interface StateTransitionConfig {
	currentState: string;
	allowedNextStates: string[];
	requiredFields: string[];
	permissionRequired?: string;
}

export interface WorkflowDefinition {
	entity: string;
	transitions: Record<string, StateTransitionConfig>;
}

const CRM_WORKFLOW_DEFINITION: WorkflowDefinition = {
	entity: "crm_lead",
	transitions: {
		Qualified: {
			currentState: "Qualified",
			allowedNextStates: ["Discovery", "Lost"],
			requiredFields: ["name"],
			permissionRequired: "lead:update_stage",
		},
		Discovery: {
			currentState: "Discovery",
			allowedNextStates: ["Proposal Sent", "Qualified", "Lost"],
			requiredFields: ["expectedRevenue"],
			permissionRequired: "lead:update_stage",
		},
		"Proposal Sent": {
			currentState: "Proposal Sent",
			allowedNextStates: ["Negotiation", "Discovery", "Lost"],
			requiredFields: ["expectedRevenue"],
			permissionRequired: "lead:update_stage",
		},
		Negotiation: {
			currentState: "Negotiation",
			allowedNextStates: ["Closed Won", "Proposal Sent", "Lost"],
			requiredFields: ["expectedRevenue"],
			permissionRequired: "lead:update_stage",
		},
		"Closed Won": {
			currentState: "Closed Won",
			allowedNextStates: [],
			requiredFields: ["expectedRevenue"],
			permissionRequired: "lead:update_stage",
		},
		Lost: {
			currentState: "Lost",
			allowedNextStates: ["Qualified"],
			requiredFields: [],
			permissionRequired: "lead:update_stage",
		},
	},
};

export class WorkflowEngine {
	private workflow: WorkflowDefinition;

	constructor(definition: WorkflowDefinition = CRM_WORKFLOW_DEFINITION) {
		this.workflow = definition;
	}

	public getAllowedNextStates(currentState: string): string[] {
		const config = this.workflow.transitions[currentState];
		return config ? config.allowedNextStates : [];
	}

	public validateTransition(
		currentState: string,
		nextState: string,
		payload: Record<string, any>,
	): { valid: boolean; error?: string } {
		const config = this.workflow.transitions[currentState];
		if (!config) {
			return { valid: false, error: `Invalid current state '${currentState}'` };
		}

		if (!config.allowedNextStates.includes(nextState)) {
			return {
				valid: false,
				error: `Transition from '${currentState}' to '${nextState}' is not allowed. Allowed next states: ${config.allowedNextStates.join(", ")}`,
			};
		}

		// Validate required fields for transition
		for (const field of config.requiredFields) {
			if (
				payload[field] === undefined ||
				payload[field] === null ||
				payload[field] === ""
			) {
				return {
					valid: false,
					error: `Missing required field '${field}' for transition to '${nextState}'`,
				};
			}
		}

		return { valid: true };
	}
}

export const workflowEngine = new WorkflowEngine();
