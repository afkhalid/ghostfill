import type { GhostFillOptions } from "./types";
import { createOverlay } from "./overlay";
import { detectFields } from "./detector";
import { generateFillData } from "./ai";
import { fillFields } from "./filler";

export type { GhostFillOptions, DetectedField, FieldFillData } from "./types";

let instance: { destroy: () => void } | null = null;

/**
 * Initialize GhostFill — adds a floating button to the page.
 *
 * @example
 * ```ts
 * import { init } from "ghostfill";
 *
 * init({ apiKey: "sk-..." });
 * ```
 */
export function init(options: GhostFillOptions): { destroy: () => void } {
  if (!options.apiKey) {
    throw new Error("GhostFill: apiKey is required");
  }

  // Destroy previous instance if exists
  if (instance) {
    instance.destroy();
  }

  const { state, destroy } = createOverlay(options);
  instance = { destroy };

  return { destroy };
}

/**
 * Programmatic API — detect fields and fill them without the UI.
 *
 * @example
 * ```ts
 * import { fill } from "ghostfill";
 *
 * await fill({
 *   container: document.querySelector("form")!,
 *   prompt: "A US-based software engineer",
 *   apiKey: "sk-...",
 * });
 * ```
 */
export async function fill(params: {
  container: HTMLElement;
  prompt: string;
  apiKey: string;
  model?: string;
  baseURL?: string;
  systemPrompt?: string;
}): Promise<{ filled: number; errors: string[] }> {
  const fields = detectFields(params.container);

  if (fields.length === 0) {
    return { filled: 0, errors: ["No fillable fields found in container"] };
  }

  const fillData = await generateFillData(fields, params.prompt, {
    apiKey: params.apiKey,
    model: params.model,
    baseURL: params.baseURL,
    systemPrompt: params.systemPrompt,
  });

  return fillFields(fields, fillData);
}
