/** Configuration options for GhostFill */
export interface GhostFillOptions {
  /** OpenAI API key (optional — can be set via settings UI) */
  apiKey?: string;
  /** OpenAI model to use (default: "gpt-4o-mini") */
  model?: string;
  /** Custom OpenAI base URL (for proxies) */
  baseURL?: string;
  /** Keyboard shortcut to toggle GhostFill (default: "Alt+G") */
  shortcut?: string;
  /** Custom system prompt to prepend */
  systemPrompt?: string;
}

/** Persisted settings (localStorage) */
export interface GhostFillSettings {
  apiKey: string;
  model: string;
  baseURL: string;
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
