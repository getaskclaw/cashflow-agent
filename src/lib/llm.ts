/**
 * LLM client — calls the Nous inference API directly.
 *
 * No subprocess, no Python, no hermes CLI dependency.
 * Uses GLM-5.2 or NVIDIA Nemotron 3 Ultra (selectable via LLM_MODEL env var).
 * Nemotron reasoning models receive extra_body params (enable_thinking, reasoning_budget).
 *
 * Environment variables:
 *   LLM_API_KEY   — Bearer token (if omitted, reads from ~/.hermes/auth.json)
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

/** Returns true if the model is an NVIDIA Nemotron reasoning model. */
function isNemotron(model: string): boolean {
  return model.toLowerCase().includes("nemotron");
}

/**
 * Resolve the API key: if LLM_API_KEY env var is set, use it.
 * Otherwise, read the fresh agent_key from ~/.hermes/auth.json
 * (the Hermes gateway refreshes this JWT every ~15 minutes).
 */
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

function resolveApiKey(): string {
  // 1. Static key from env (production)
  const envKey = process.env.LLM_API_KEY;
  if (envKey && envKey.trim()) return envKey.trim();

  // 2. Fresh JWT from Hermes auth.json (local dev / same-host as gateway)
  try {
    const authPath = join(homedir(), ".hermes", "auth.json");
    const authRaw = readFileSync(authPath, "utf-8");
    const auth = JSON.parse(authRaw);

    // Check credential_pool.nous[0].agent_key first (most reliable)
    const poolNous = auth?.credential_pool?.nous?.[0];
    if (poolNous?.agent_key) {
      return poolNous.agent_key;
    }

    // Fall back to providers.nous.agent_key
    const providerNous = auth?.providers?.nous;
    if (providerNous?.agent_key) {
      return providerNous.agent_key;
    }

    // Fall back to access_token
    if (poolNous?.access_token) {
      return poolNous.access_token;
    }
  } catch {
    // auth.json not found or unreadable
  }

  throw new Error(
    "No LLM API key found. Set LLM_API_KEY env var or ensure ~/.hermes/auth.json exists."
  );
}

export async function callLLM(
  messages: LLMMessage[],
  options?: { maxTokens?: number; temperature?: number }
): Promise<LLMResponse> {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error("No LLM API key — set LLM_API_KEY or ensure ~/.hermes/auth.json exists");
  }

  const baseUrl = process.env.LLM_BASE_URL || DEFAULT_BASE_URL;
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;

  // Build request body — Nemotron reasoning models need extra_body params.
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: options?.maxTokens ?? 4096,
    temperature: options?.temperature ?? 0.7,
  };

  if (isNemotron(model)) {
    body.extra_body = {
      chat_template_kwargs: { enable_thinking: true },
      reasoning_budget: 4096,
    };
  }

  const response = await fetch(baseUrl + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error("LLM API error " + response.status + ": " + errorBody.slice(0, 200));
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  // Both GLM-5.2 and Nemotron 3 Ultra are reasoning models — content may be
  // null if all tokens went to reasoning. Fall back to reasoning_content.
  let content = choice?.message?.content;
  if (!content && choice?.message?.reasoning_content) {
    content = choice.message.reasoning_content;
  }
  if (!content) {
    throw new Error("LLM returned empty content — try increasing max_tokens or reasoning_budget");
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
