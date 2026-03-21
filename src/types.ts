/** Configuration options for GhostFill */
export interface GhostFillOptions {
  /**
   * @deprecated Browser API keys are insecure and ignored.
   * Configure `ai` and keep provider credentials on your backend instead.
   */
  apiKey?: string;
  /** Keyboard shortcut to toggle GhostFill (default: "Alt+G") */
  shortcut?: string;
  /** Custom system prompt to prepend */
  systemPrompt?: string;
  /** Secure AI transport configuration */
  ai?: GhostFillAIOptions;
}

export type Provider = "openai" | "xai" | "moonshot";

export const PROVIDERS: Record<Provider, { label: string; model: string; baseURL: string; helpText: string }> = {
  openai: { label: "OpenAI", model: "gpt-4o-mini", baseURL: "https://api.openai.com/v1", helpText: "Uses gpt-4o-mini — fast & cheap" },
  xai: { label: "xAI", model: "grok-4-fast", baseURL: "https://api.x.ai/v1", helpText: "Uses Grok 4 Fast" },
  moonshot: { label: "Moonshot", model: "kimi-k2", baseURL: "https://api.moonshot.ai/v1", helpText: "Uses Kimi K2 — fast & cheap" },
};

/** Non-secret field metadata sent to an AI backend */
export interface GhostFillPromptField {
  index: number;
  type: string;
  name: string;
  label: string;
  options?: string[];
  required: boolean;
  min?: string;
  max?: string;
  pattern?: string;
}

/** Secure AI request payload for a backend route or callback */
export interface GhostFillAIRequest {
  provider: Provider;
  prompt: string;
  systemPrompt?: string;
  fields: GhostFillPromptField[];
}

export type GhostFillAIHandler = (
  request: GhostFillAIRequest
) => Promise<FieldFillData[]>;

/** Secure AI configuration. Requests must go through a backend or custom handler. */
export interface GhostFillAIOptions {
  /** Same-origin backend route. Defaults to `/api/ghostfill` when `ai` is enabled. */
  endpoint?: string;
  /** Optional custom transport that forwards requests to a secure backend. */
  requestFillData?: GhostFillAIHandler;
  /** Default provider shown in the UI. */
  provider?: Provider;
}

/** A saved prompt preset */
export interface Preset {
  id: string;
  name: string;
  prompt: string;
}

/** Persisted settings (localStorage) */
export interface GhostFillSettings {
  apiKey: string;
  provider: Provider;
  highlightColor: string;
  theme: "dark" | "light";
  useAI: boolean;
  presets: Preset[];
  activePresetId: string | null;
}

/** A detected form field */
export interface DetectedField {
  /** The DOM element */
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;
  /** Field type: text, email, number, select, textarea, checkbox, radio, date, etc. */
  type: string;
  /** Field name attribute */
  name: string;
  /** Field label (from <label>, aria-label, or placeholder) */
  label: string;
  /** For <select>, the available options */
  options?: string[];
  /** Whether the field is required */
  required: boolean;
  /** Current value */
  currentValue: string;
  /** Min/max for number/date fields */
  min?: string;
  max?: string;
  /** Pattern attribute */
  pattern?: string;
}

/** Field data returned by the AI */
export interface FieldFillData {
  /** Index matching the DetectedField array */
  index: number;
  /** Value to fill */
  value: string;
  /** For checkboxes: whether to check */
  checked?: boolean;
}

/** Internal state */
export interface GhostFillState {
  active: boolean;
  selecting: boolean;
  selectedBlock: HTMLElement | null;
  fields: DetectedField[];
}
