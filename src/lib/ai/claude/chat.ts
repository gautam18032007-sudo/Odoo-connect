import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, getModelId } from "./client";
import { runTool, TOOL_REGISTRY } from "./tools";

export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}

export interface ChatToolCall {
	name: string;
	input: unknown;
	success: boolean;
}

export interface ChatResult {
	answer: string;
	toolCalls: ChatToolCall[];
}

const SYSTEM_PROMPT = `You are the ZenZebra Sales CRM's AI assistant. You answer business questions using ONLY the data returned by the tools available to you — never invent, estimate, or guess a number.

Rules:
- Always call a tool when the question needs real data (sales, stores, products, stock, customers). Never answer a data question from memory.
- If a tool call fails or returns no data, say so plainly, e.g. "I couldn't retrieve today's sales data." Never substitute a plausible-sounding number.
- Distinguish revenue (net_amount, taxable), gross collection (gross_amount, includes tax), GST/tax, and order counts — never conflate them.
- Format currency as Indian Rupees, e.g. ₹12,345.
- If the user doesn't specify a date, assume "today" for current-state questions and the trailing 30 days for trend/ranking questions (matching each tool's own default).
- Keep answers concise and business-focused — a sentence or two, not a report.`;

const anthropicTools: Anthropic.Tool[] = TOOL_REGISTRY.map((t) => ({
	name: t.name,
	description: t.description,
	input_schema: t.schema,
}));

/**
 * Runs the full tool-use loop: send the user's message + approved tools to
 * Claude, execute whichever tool(s) Claude requests via the backend's own
 * registry (never arbitrary code), feed the real result back, and return
 * Claude's final natural-language answer plus a log of what was called.
 */
export async function runChat(
	message: string,
	history: ChatMessage[] = [],
): Promise<ChatResult> {
	const anthropic = getAnthropicClient();
	const model = getModelId();

	const messages: Anthropic.MessageParam[] = [
		...history.map(
			(m) => ({ role: m.role, content: m.content }) as Anthropic.MessageParam,
		),
		{ role: "user", content: message },
	];

	const toolCalls: ChatToolCall[] = [];
	const MAX_TURNS = 4;

	for (let turn = 0; turn < MAX_TURNS; turn++) {
		const response = await anthropic.messages.create({
			model,
			max_tokens: 1024,
			system: SYSTEM_PROMPT,
			tools: anthropicTools,
			messages,
		});

		const toolUseBlocks = response.content.filter(
			(b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
		);

		if (toolUseBlocks.length === 0) {
			const textBlock = response.content.find(
				(b): b is Anthropic.TextBlock => b.type === "text",
			);
			return {
				answer: textBlock?.text?.trim() || "I don't have an answer for that.",
				toolCalls,
			};
		}

		messages.push({ role: "assistant", content: response.content });

		const toolResults: Anthropic.ToolResultBlockParam[] = [];
		for (const block of toolUseBlocks) {
			const result = await runTool(block.name, block.input);
			toolCalls.push({
				name: block.name,
				input: block.input,
				success: result.success,
			});
			toolResults.push({
				type: "tool_result",
				tool_use_id: block.id,
				content: JSON.stringify(result),
				is_error: !result.success,
			});
		}
		messages.push({ role: "user", content: toolResults });
	}

	return {
		answer:
			"I wasn't able to finish answering that within the allowed steps. Please try rephrasing.",
		toolCalls,
	};
}
