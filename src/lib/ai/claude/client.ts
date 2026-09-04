import Anthropic from "@anthropic-ai/sdk";

/**
 * Server-only Anthropic client. Never import this file from a "use client"
 * component — ANTHROPIC_API_KEY must never reach the browser bundle.
 */
let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
	if (!process.env.ANTHROPIC_API_KEY) {
		throw new Error("ANTHROPIC_API_KEY is not configured.");
	}
	if (!client) {
		client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
	}
	return client;
}

/** Configurable via env so the model can be changed without a code deploy. */
export function getModelId(): string {
	return process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";
}
