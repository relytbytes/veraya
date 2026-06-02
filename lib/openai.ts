import OpenAI from "openai";

// Single place the whole app reaches OpenAI from. Vera's AI phrasing (dashboard
// narrative, menu moves, labor/forecast reads, photo/describe) all route through
// here so the model + key handling stay consistent and upgradable.
//
// Set OPENAI_API_KEY in the environment (Vercel → Settings → Environment
// Variables) to enable it. OPENAI_MODEL optionally overrides the default model.

export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export function aiEnabled(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/** Returns a configured client, or null when no key is set (callers fall back). */
export function getOpenAI(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  return apiKey ? new OpenAI({ apiKey }) : null;
}

/**
 * Convenience: run a chat completion and return the trimmed text, or null on
 * any failure (no key, network, rate limit) so callers degrade gracefully.
 */
export async function veraComplete(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
}): Promise<string | null> {
  const client = getOpenAI();
  if (!client) return null;
  try {
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 200,
      ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error("[veraComplete] OpenAI call failed:", (err as Error)?.message ?? err);
    return null;
  }
}
