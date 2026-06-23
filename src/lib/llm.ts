/**
 * LLM client — calls the Nous inference API directly.
 *
 * No subprocess, no Python, no hermes CLI dependency.
 * Uses the same provider/model as the Hermes agent (z-ai/glm-5.2).
 *
 * Environment variables:
 *   LLM_API_KEY   — Bearer token for the inference API
 *   LLM_BASE_URL  — API endpoint (default: https://inference-api.nousresearch.com/v1)
 *   LLM_MODEL     — Model name (default: z-ai/glm-5.2)
 */

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost: number;
  };
  model: string;
}

const DEFAULT_BASE_URL = "https://inference-api.nousresearch.com/v1";
const DEFAULT_MODEL = "z-ai/glm-5.2";

export async function callLLM(
  messages: LLMMessage[],
  options?: { maxTokens?: number; temperature?: number }
): Promise<LLMResponse> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error("LLM_API_KEY not set — cannot call LLM API");
  }

  const baseUrl = process.env.LLM_BASE_URL || DEFAULT_BASE_URL;
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;

  const response = await fetch(baseUrl + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: options?.maxTokens ?? 2000,
      temperature: options?.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error("LLM API error " + response.status + ": " + errorBody.slice(0, 200));
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  // GLM-5.2 is a reasoning model — content may be null if all tokens went to reasoning.
  // If content is null, check if there's reasoning content we can use.
  let content = choice?.message?.content;
  if (!content && choice?.message?.reasoning_content) {
    content = choice.message.reasoning_content;
  }
  if (!content) {
    throw new Error("LLM returned empty content — try increasing max_tokens");
  }

  return {
    content,
    usage: {
      prompt_tokens: data.usage?.prompt_tokens ?? 0,
      completion_tokens: data.usage?.completion_tokens ?? 0,
      total_tokens: data.usage?.total_tokens ?? 0,
      cost: data.usage?.cost ?? 0,
    },
    model: data.model ?? model,
  };
}
