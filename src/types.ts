/** Configuration options for GhostFill */
export interface GhostFillOptions {
  /** API key (optional — can be set via settings UI) */
  apiKey?: string;
  /** Keyboard shortcut to toggle GhostFill (default: "Alt+G") */
  shortcut?: string;
  /** Custom system prompt to prepend */
  systemPrompt?: string;
}

export type Provider = "openai" | "xai" | "moonshot";

export const PROVIDERS: Record<Provider, { label: string; model: string; baseURL: string; helpText: string }> = {
  openai: { label: "OpenAI", model: "gpt-4o-mini", baseURL: "https://api.openai.com/v1", helpText: "Uses gpt-4o-mini — fast & cheap" },
  xai: { label: "xAI", model: "grok-4-fast", baseURL: "https://api.x.ai/v1", helpText: "Uses Grok 4 Fast" },
  moonshot: { label: "Moonshot", model: "kimi-k2", baseURL: "https://api.moonshot.ai/v1", helpText: "Uses Kimi K2 — fast & cheap" },
};

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
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
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
  overlay: HTMLElement | null;
  shadowRoot: ShadowRoot | null;
}
