import type { GhostFillAIOptions, GhostFillOptions, Provider } from "./types";
import { createOverlay } from "./overlay";
import { detectFields } from "./detector";
import { generateFillData } from "./ai";
import { generateFakeData } from "./faker";
import { fillFields } from "./filler";

export type {
  GhostFillAIOptions,
  GhostFillAIRequest,
  GhostFillOptions,
  GhostFillPromptField,
  DetectedField,
  FieldFillData,
  Provider,
} from "./types";
export { PROVIDERS } from "./types";

let instance: { destroy: () => void } | null = null;

/**
 * Initialize GhostFill — adds a floating ghost icon to the page.
 *
 * @example
 * ```ts
 * import { init } from "ghostfill";
 * init();
 * ```
 */
export function init(options: GhostFillOptions = {}): { destroy: () => void } {
  const existing = document.getElementById("ghostfill-root");
  if (existing && instance) {
    return instance;
  }

  if (instance) {
    instance.destroy();
    instance = null;
  }

  const { state, destroy } = createOverlay(options);
  instance = { destroy };
  return { destroy };
}

/**
 * Programmatic API — detect fields and fill them without the UI.
 */
export async function fill(params: {
  container: HTMLElement;
  prompt?: string;
  ai?: GhostFillAIOptions;
  provider?: Provider;
  systemPrompt?: string;
}): Promise<{ filled: number; errors: string[] }> {
  const fields = detectFields(params.container);

  if (fields.length === 0) {
    return { filled: 0, errors: ["No fillable fields found in container"] };
  }

  const fillData = params.ai
    ? await generateFillData(
        fields,
        params.prompt || "",
        params.provider || params.ai.provider || "openai",
        params.ai,
        params.systemPrompt
      )
    : generateFakeData(fields);

  return fillFields(fields, fillData);
}
