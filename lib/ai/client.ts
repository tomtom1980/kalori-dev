/**
 * Gemini REST client wrapper (Task 3.2).
 *
 * Thin fetch-based wrapper around Google's `generativelanguage.googleapis.com`
 * REST API. Intentionally avoids the `@google/genai` SDK at MVP scale — the
 * REST surface is stable, MSW can intercept it cleanly, and the dependency
 * graph stays small. If the project later adopts the SDK, only this file
 * changes.
 *
 * Runtime = 'nodejs'. Reads `GEMINI_API_KEY` from `process.env` on each call
 * (lazy lookup, not module-scope, so test environments can set it late).
 *
 * Contract:
 *   - Accepts a `PromptPayload` (systemInstruction + contents parts array).
 *   - Supports an `abortSignal` for timeout via the caller's AbortController.
 *   - Returns the raw JSON payload parsed from the model's first candidate
 *     content, plus best-effort token counts and cost estimate.
 *   - Throws on non-2xx response or network error — the route handler's
 *     try/catch converts that to a fallback payload (I7).
 */
import type { PromptPayload } from './prompts';

export interface GeminiCallInput extends PromptPayload {
  readonly model?: string;
  readonly generationConfig?: {
    readonly responseMimeType?: 'application/json';
    readonly maxOutputTokens?: number;
  };
  readonly abortSignal?: AbortSignal;
}

export interface GeminiCallResult {
  readonly raw: unknown;
  readonly tokens: number;
  readonly costEstimate: number;
}

const DEFAULT_MODEL = 'gemini-flash-latest';

export function getConfiguredGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * Flash pricing per 1K tokens (USD) — `gemini-flash-latest` as of 2026-04.
 * Averaged across input/output for MVP; tune if/when the cost-log tells us
 * input-heavy or output-heavy traffic actually matters.
 */
const COST_PER_1K_TOKENS_USD = 0.000375;

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.length === 0) {
    throw new Error('GEMINI_API_KEY is not set in process.env');
  }
  return key;
}

interface GeminiEnvelope {
  readonly candidates?: readonly {
    readonly content?: {
      readonly parts?: readonly { readonly text?: string }[];
    };
  }[];
  readonly usageMetadata?: {
    readonly promptTokenCount?: number;
    readonly candidatesTokenCount?: number;
    readonly totalTokenCount?: number;
  };
}

function extractRawPayload(payload: unknown): unknown {
  // Gemini REST returns `{candidates: [{content: {parts: [{text: '<json>'}]}}]}`
  // where text is a JSON string when responseMimeType='application/json'.
  // The MSW stubs in our test suite bypass that envelope and return the
  // parsed JSON directly. Handle both shapes.
  if (typeof payload !== 'object' || payload === null) return payload;
  const envelope = payload as GeminiEnvelope;
  const firstText = envelope.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof firstText === 'string' && firstText.length > 0) {
    try {
      return JSON.parse(firstText);
    } catch {
      // Not JSON — return the envelope so Zod parse fails loudly and the
      // route falls back gracefully.
      return payload;
    }
  }
  return payload;
}

export async function callGemini(input: GeminiCallInput): Promise<GeminiCallResult> {
  const model = input.model ?? getConfiguredGeminiModel();
  const apiKey = getApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const requestBody = {
    systemInstruction: input.systemInstruction,
    contents: input.contents,
    generationConfig: input.generationConfig ?? {
      responseMimeType: 'application/json',
    },
  };

  const fetchInit: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  };
  if (input.abortSignal) {
    fetchInit.signal = input.abortSignal;
  }
  const response = await fetch(url, fetchInit);

  if (!response.ok) {
    throw new Error(`Gemini call failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  const raw = extractRawPayload(payload);

  const envelope = (
    typeof payload === 'object' && payload !== null ? (payload as GeminiEnvelope) : {}
  ) as GeminiEnvelope;
  const promptTokens = envelope.usageMetadata?.promptTokenCount ?? 0;
  const candidateTokens = envelope.usageMetadata?.candidatesTokenCount ?? 0;
  const totalTokens = envelope.usageMetadata?.totalTokenCount ?? promptTokens + candidateTokens;
  const costEstimate = (totalTokens / 1000) * COST_PER_1K_TOKENS_USD;

  return { raw, tokens: totalTokens, costEstimate };
}
