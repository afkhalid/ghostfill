import type {
  DetectedField,
  GhostFillOptions,
  GhostFillState,
  GhostFillSettings,
  Preset,
  Provider,
} from "./types";
import { PROVIDERS } from "./types";
import { detectFields, describeFields } from "./detector";
import { generateFillData } from "./ai";
import { generateFakeData } from "./faker";
import { fillFields } from "./filler";
import { startSelection } from "./selector";

const STORAGE_KEY = "ghostfill_settings";
const POS_KEY = "ghostfill_pos";
const FAB_POS_KEY = "ghostfill_fab_pos";

function isProvider(value: unknown): value is Provider {
  return value === "openai" || value === "xai" || value === "moonshot";
}

function defaultSettings(provider: Provider): GhostFillSettings {
  return {
    apiKey: "",
    provider,
    highlightColor: "#6366f1",
    theme: "dark",
    useAI: false,
    presets: [],
    activePresetId: null,
  };
}

function sanitizePresets(value: unknown): Preset[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (
      typeof item === "object" &&
      item !== null &&
      typeof (item as { id?: unknown }).id === "string" &&
      typeof (item as { name?: unknown }).name === "string" &&
      typeof (item as { prompt?: unknown }).prompt === "string"
    ) {
      return [item as Preset];
    }

    return [];
  });
}

function loadSettings(provider: Provider): GhostFillSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
        provider: isProvider(parsed.provider) ? parsed.provider : provider,
        highlightColor:
          typeof parsed.highlightColor === "string"
            ? parsed.highlightColor
            : "#6366f1",
        theme: parsed.theme === "light" ? "light" : "dark",
        useAI: parsed.useAI === true,
        presets: sanitizePresets(parsed.presets),
        activePresetId:
          typeof parsed.activePresetId === "string"
            ? parsed.activePresetId
            : null,
      };
    }
  } catch {}
  return defaultSettings(provider);
}

function saveSettings(s: GhostFillSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

function loadPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function savePosition(x: number, y: number) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify({ x, y }));
  } catch {}
}

/** Extract a clean error message from AI API errors */
function cleanError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Try to extract the "message" field from JSON error bodies
  const match = raw.match(/"message"\s*:\s*"([^"]+)"/);
  if (match) return match[1];
  // Strip "AI API error (NNN): " prefix noise
  const stripped = raw.replace(/^AI API error \(\d+\):\s*/, "");
  // If it's JSON, try to parse
  try {
    const parsed = JSON.parse(stripped);
    if (parsed?.error?.message) return parsed.error.message;
  } catch {}
  return stripped.length > 80 ? stripped.slice(0, 80) + "..." : stripped;
}

// ─── Icons ──────────────────────────────────────────────────────────────────

const ICONS = {
  select: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
    <circle cx="12" cy="12" r="4"/>
  </svg>`,
  sparkles: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
    <path d="M20 3v4M22 5h-4"/>
  </svg>`,
  settings: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
  </svg>`,
  close: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,
  ghost: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2C7.58 2 4 5.58 4 10v10l2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2V10c0-4.42-3.58-8-8-8z"/>
    <circle cx="9" cy="10" r="1.5" fill="currentColor"/>
    <circle cx="15" cy="10" r="1.5" fill="currentColor"/>
  </svg>`,
  spinner: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <path d="M12 2a10 10 0 0 1 10 10"/>
  </svg>`,
  // Field type icons (14x14)
  ftText: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>`,
  ftEmail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  ftPhone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>`,
  ftNumber: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/></svg>`,
  ftDate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
  ftSelect: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>`,
  ftTextarea: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 10H3M21 6H3M21 14H3M17 18H3"/></svg>`,
  ftCheckbox: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg>`,
  ftRadio: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>`,
  ftUrl: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`,
  ftPassword: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`,
  ftFile: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`,
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const CSS = `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    font-size: 13px;
    color: #e4e4e7;
    line-height: 1.4;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }

  .gf-bar {
    position: fixed;
    z-index: 2147483646;
    display: flex;
    align-items: center;
    gap: 2px;
    background: #18181b;
    border-radius: 22px;
    padding: 5px 6px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06);
    user-select: none;
    cursor: grab;
    pointer-events: auto;
  }
  .gf-bar.dragging { cursor: grabbing; opacity: 0.9; }

  .gf-bar-btn {
    position: relative;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: #a1a1aa;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, color 0.15s;
  }
  .gf-bar-btn:hover { background: #27272a; color: #fafafa; }
  .gf-bar-btn.active { background: #3f3f46; color: #fafafa; }
  .gf-bar-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .gf-bar-btn:disabled:hover { background: transparent; color: #a1a1aa; }

  .gf-divider {
    width: 1px; height: 20px; background: #3f3f46; margin: 0 4px; flex-shrink: 0;
  }


  .gf-fab {
    position: fixed; z-index: 2147483646;
    width: 48px; height: 48px; border-radius: 50%; border: none;
    background: #18181b; color: #e4e4e7; cursor: grab;
    display: none; align-items: center; justify-content: center;
    pointer-events: auto;
    box-shadow: 0 0 20px rgba(99,102,241,0.3), 0 0 40px rgba(99,102,241,0.1), 0 4px 16px rgba(0,0,0,0.35), 0 0 0 1px rgba(99,102,241,0.15);
    transition: color 0.2s, box-shadow 0.3s;
  }
  .gf-fab > svg {
    filter: drop-shadow(0 0 4px rgba(99,102,241,0.5));
    transition: transform 0.2s;
  }
  .gf-fab:hover {
    color: #fff;
    box-shadow: 0 0 30px rgba(99,102,241,0.5), 0 0 60px rgba(99,102,241,0.2), 0 4px 16px rgba(0,0,0,0.35), 0 0 0 1px rgba(99,102,241,0.3);
  }
  .gf-fab:hover > svg {
    animation: gf-ghost-wobble 1.5s ease-in-out infinite;
  }
  .gf-fab.visible { display: flex; }

  @keyframes gf-ghost-wobble {
    0%, 100% { transform: translate(0, 0) rotate(0deg); }
    25% { transform: translate(1px, -2px) rotate(4deg); }
    50% { transform: translate(0, -3px) rotate(-1deg); }
    75% { transform: translate(-1px, -1px) rotate(-4deg); }
  }

  /* Success flash on filled block */
  @keyframes gf-fill-success {
    0% { box-shadow: 0 0 0 0 rgba(99,102,241,0.4); }
    30% { box-shadow: 0 0 0 6px rgba(99,102,241,0.2); }
    60% { box-shadow: 0 0 0 12px rgba(52,211,153,0.15); }
    100% { box-shadow: 0 0 0 0 rgba(52,211,153,0); }
  }

  .gf-popover {
    position: fixed; z-index: 2147483646;
    background: #1a1a1a; border-radius: 16px; pointer-events: auto;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.08);
    display: none; flex-direction: column; overflow: hidden;
    width: 280px;
  }
  .gf-popover.open { display: flex; }

  .gf-pop-header {
    display: flex; align-items: center; justify-content: space-between;
    min-height: 24px; padding: 13px 16px 0;
    margin-bottom: 8px; padding-bottom: 9px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  .gf-pop-header h3 {
    font-size: 13px; font-weight: 600; color: #fff;
    letter-spacing: -0.0094em;
  }
  .gf-pop-header .gf-slash { color: rgba(255,255,255,0.5); }
  .gf-pop-header .gf-header-right {
    display: flex; align-items: center; gap: 6px;
  }
  .gf-pop-header .gf-version {
    font-size: 11px; font-weight: 400; color: rgba(255,255,255,0.4);
    letter-spacing: -0.0094em;
  }
  .gf-theme-btn {
    width: 20px; height: 20px; border: none; border-radius: 4px;
    background: transparent; color: rgba(255,255,255,0.4); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: color 0.15s;
  }
  .gf-theme-btn:hover { color: rgba(255,255,255,0.7); }
  .gf-theme-btn svg { width: 14px; height: 14px; }

  .gf-sep {
    height: 1px; background: rgba(255,255,255,0.07);
    margin: 8px 0 10px;
  }

  /* Highlight color picker */
  .gf-colors {
    display: flex; gap: 6px; flex-wrap: wrap;
  }
  .gf-color-dot {
    width: 24px; height: 24px; border-radius: 50%; border: 2px solid transparent;
    cursor: pointer; transition: border-color 0.15s, transform 0.1s;
  }
  .gf-color-dot:hover { transform: scale(1.1); }
  .gf-color-dot.selected { border-color: #fafafa; }

  .gf-pop-body {
    padding: 0 16px 16px; display: flex; flex-direction: column; gap: 10px;
    max-height: 400px; overflow-y: auto;
  }

  .gf-field { display: flex; flex-direction: column; gap: 4px; }
  .gf-label {
    font-size: 13px; font-weight: 400; color: rgba(255,255,255,0.5);
    letter-spacing: -0.0094em; display: flex; align-items: center; gap: 2px;
  }
  .gf-input {
    width: 100%; padding: 6px 8px; background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #fff;
    font-family: inherit; font-size: 13px; outline: none; transition: border-color 0.15s;
  }
  .gf-input:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,0.15); }
  .gf-input::placeholder { color: rgba(255,255,255,0.25); }
  .gf-input-mono { font-family: "SF Mono", "Fira Code", monospace; font-size: 12px; }

  textarea.gf-input { min-height: 56px; resize: vertical; line-height: 1.5; }

  .gf-save-btn, .gf-fill-btn {
    width: 100%; padding: 7px; border: none; border-radius: 8px;
    background: #6366f1; color: white; font-family: inherit;
    font-size: 13px; font-weight: 500; cursor: pointer; transition: background 0.15s;
    display: flex; align-items: center; justify-content: center; gap: 5px;
  }
  .gf-save-btn:hover, .gf-fill-btn:hover { background: #4f46e5; }
  .gf-fill-btn:disabled { background: #6366f1; opacity: 0.5; cursor: not-allowed; }

  .gf-pop-body::-webkit-scrollbar { width: 6px; }
  .gf-pop-body::-webkit-scrollbar-track { background: transparent; }
  .gf-pop-body::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 3px; }

  .gf-field-count { font-size: 11px; color: #71717a; }

  /* ── Field cards grid ── */
  .gf-fields-grid {
    display: flex; flex-wrap: wrap; gap: 6px;
    max-height: 140px; overflow-y: auto; padding: 2px;
    scrollbar-color: #3f3f46 transparent;
  }
  .gf-fields-grid::-webkit-scrollbar { width: 5px; }
  .gf-fields-grid::-webkit-scrollbar-track { background: transparent; }
  .gf-fields-grid::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 3px; }

  .gf-field-card {
    display: flex; align-items: center; gap: 5px;
    padding: 4px 8px; border-radius: 8px;
    background: #27272a; border: 1px solid #3f3f46;
    cursor: default; transition: border-color 0.15s, background 0.15s;
    max-width: 100%;
  }
  .gf-field-card:hover {
    border-color: #6366f1; background: #2e2442;
  }
  .gf-field-card .gf-fc-icon {
    flex-shrink: 0; width: 16px; height: 16px; color: #6366f1;
    display: flex; align-items: center; justify-content: center;
  }
  .gf-field-card .gf-fc-icon svg { width: 14px; height: 14px; }
  .gf-field-card .gf-fc-label {
    font-size: 11px; color: #d4d4d8; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
  }
  .gf-field-card .gf-fc-req {
    color: #f87171; font-size: 11px; flex-shrink: 0;
  }

  /* Inline status text inside prompt popover */
  .gf-status {
    font-size: 11px; padding: 4px 0; text-align: center; min-height: 18px;
    transition: color 0.15s;
  }
  .gf-status.error { color: #f87171; }
  .gf-status.success { color: #4ade80; }
  .gf-status.info { color: #71717a; }

  .gf-spin { animation: gf-spin 0.7s linear infinite; }
  @keyframes gf-spin { to { transform: rotate(360deg); } }

  .gf-badge {
    position: absolute; top: 2px; right: 2px; width: 14px; height: 14px;
    border-radius: 7px; background: #6366f1; color: white;
    font-size: 9px; font-weight: 700; display: flex; align-items: center;
    justify-content: center; line-height: 1;
  }

  .gf-dot-warn {
    position: absolute; top: 4px; right: 4px; width: 6px; height: 6px;
    border-radius: 3px; background: #f59e0b;
  }

  /* Toggle switch */
  .gf-toggle {
    position: relative; display: inline-block; width: 32px; height: 18px; cursor: pointer;
  }
  .gf-toggle input { opacity: 0; width: 0; height: 0; }
  .gf-toggle-slider {
    position: absolute; inset: 0; background: #3f3f46; border-radius: 9px;
    transition: background 0.2s;
  }
  .gf-toggle-slider::before {
    content: ""; position: absolute; left: 2px; top: 2px;
    width: 14px; height: 14px; border-radius: 50%; background: #fafafa;
    transition: transform 0.2s;
  }
  .gf-toggle input:checked + .gf-toggle-slider { background: #6366f1; }
  .gf-toggle input:checked + .gf-toggle-slider::before { transform: translateX(14px); }

  /* Custom inline picker (like Agentation's "Standard") */
  .gf-picker {
    position: relative; display: flex; align-items: center; gap: 4px;
    cursor: pointer; user-select: none;
  }
  .gf-picker-value {
    font-size: 13px; font-weight: 400; color: rgba(255,255,255,0.85);
    letter-spacing: -0.0094em;
  }
  .gf-picker-dots {
    font-size: 14px; color: #52525b; line-height: 1;
  }
  .gf-picker-menu {
    display: none; position: absolute; right: 0; top: calc(100% + 6px);
    background: #09090b; border: 1px solid #27272a; border-radius: 8px;
    padding: 4px 0; min-width: 140px; z-index: 10;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  }
  .gf-picker-menu.open { display: block; }
  .gf-picker-option {
    padding: 6px 12px; font-size: 12px; color: #a1a1aa; cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }
  .gf-picker-option:hover { background: #27272a; color: #fafafa; }
  .gf-picker-option.selected { color: #6366f1; }

  /* Preset chips */
  .gf-presets-row {
    display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
  }
  .gf-preset-chip {
    padding: 3px 8px; border-radius: 10px; font-size: 11px; font-weight: 500;
    background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.5);
    cursor: pointer; border: 1px solid transparent;
    transition: all 0.15s; white-space: nowrap;
  }
  .gf-preset-chip:hover { color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.1); }
  .gf-preset-chip.active { border-color: #6366f1; color: #a5b4fc; background: rgba(99,102,241,0.12); }
  .gf-preset-chip.add {
    color: rgba(255,255,255,0.3); border: 1px dashed rgba(255,255,255,0.15);
    background: transparent;
  }
  .gf-preset-chip.add:hover { color: rgba(255,255,255,0.6); border-color: rgba(255,255,255,0.3); }

  /* Preset pills in settings */
  .gf-preset-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .gf-preset-pill {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 10px; border-radius: 20px;
    font-size: 12px; font-weight: 500; cursor: pointer;
    border: 1px solid; transition: all 0.15s;
  }
  .gf-preset-pill .gf-pp-name {
    cursor: pointer; transition: opacity 0.15s;
  }
  .gf-preset-pill .gf-pp-name:hover { opacity: 0.7; }
  .gf-preset-pill .gf-pp-x {
    background: none; border: none; cursor: pointer;
    font-size: 13px; line-height: 1; opacity: 0.4; transition: opacity 0.15s, color 0.15s;
    padding: 0; margin-left: 2px; font-family: inherit;
  }
  .gf-preset-pill .gf-pp-x:hover { opacity: 1; color: #f87171; }

  /* Preset edit overlay — takes over the entire settings panel */
  .gf-preset-overlay {
    position: absolute; inset: 0;
    background: #1a1a1a; border-radius: 16px;
    display: none; flex-direction: column;
    z-index: 5;
  }
  .gf-preset-overlay[style*="display: flex"], .gf-preset-overlay[style*="display:flex"] {
    display: flex;
  }
  .gf-preset-overlay-body {
    flex: 1; display: flex; flex-direction: column;
    padding: 0 16px 16px; gap: 10px; overflow-y: auto;
  }
  .gf-preset-form-actions { display: flex; gap: 6px; justify-content: flex-end; }
  .gf-preset-form-btn {
    padding: 6px 14px; border: none; border-radius: 8px; font-size: 12px; font-weight: 500;
    cursor: pointer; font-family: inherit; transition: background 0.15s;
  }
  .gf-preset-form-btn.save { background: #6366f1; color: white; }
  .gf-preset-form-btn.save:hover { background: #4f46e5; }
  .gf-preset-form-btn.cancel { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.5); }
  .gf-preset-form-btn.cancel:hover { background: rgba(255,255,255,0.1); }

  /* Cycle dots (vertical indicator like Agentation) */
  .gf-cycle-dots {
    display: flex; flex-direction: column; gap: 2px; margin-left: 4px;
  }
  .gf-cycle-dot {
    width: 3px; height: 3px; border-radius: 50%;
    background: rgba(255,255,255,0.2); transition: background 0.2s, transform 0.2s;
    transform: scale(0.67);
  }
  .gf-cycle-dot.active { background: #fff; transform: scale(1); }

  /* Help badge */
  .gf-help {
    position: relative;
    display: inline-flex; align-items: center; justify-content: center;
    width: 14px; height: 14px; border-radius: 50%;
    background: #3f3f46; color: #a1a1aa; font-size: 9px; font-weight: 700;
    cursor: help; flex-shrink: 0;
  }
  .gf-help-tip {
    display: none; position: absolute; bottom: calc(100% + 6px); left: 50%;
    transform: translateX(-50%); padding: 6px 10px;
    background: #383838; color: rgba(255,255,255,0.7);
    font-size: 11px; font-weight: 400; line-height: 1.4;
    border-radius: 8px; white-space: normal; width: 180px; text-align: left;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3); z-index: 100;
  }
  .gf-help-tip.show { display: block; }

  .gf-note {
    font-size: 11px;
    color: rgba(255,255,255,0.5);
    line-height: 1.5;
  }
`;

// ─── Build UI ───────────────────────────────────────────────────────────────

export function createOverlay(options: GhostFillOptions): {
  state: GhostFillState;
  destroy: () => void;
} {
  const aiConfig = options.ai || null;
  const saved = loadSettings(aiConfig?.provider || "openai");

  if (options.apiKey) {
    console.warn(
      "[ghostfill] Browser API keys are ignored. Configure init({ ai: ... }) and keep provider keys on your backend."
    );
  }

  const backendLabel = aiConfig
    ? aiConfig.requestFillData
      ? "Custom secure handler"
      : aiConfig.endpoint || "/api/ghostfill"
    : "Configure init({ ai: ... }) to enable AI.";

  const host = document.createElement("div");
  host.id = "ghostfill-root";
  host.style.cssText = "display:contents;";
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = CSS;
  shadow.appendChild(style);

  const state: GhostFillState = {
    active: false, selecting: false, selectedBlock: null,
    fields: [], overlay: host, shadowRoot: shadow,
  };

  // ── Toolbar ──
  const bar = document.createElement("div");
  bar.className = "gf-bar";
  shadow.appendChild(bar);

  // Start minimized — bar hidden, fab visible
  bar.style.display = "none";
  const savedPos = loadPosition();
  if (savedPos) {
    bar.style.left = `${savedPos.x}px`;
    bar.style.top = `${savedPos.y}px`;
  } else {
    bar.style.bottom = "20px";
    bar.style.left = "50%";
    bar.style.transform = "translateX(-50%)";
  }

  function makeBtn(icon: string): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = "gf-bar-btn";
    btn.innerHTML = icon;
    return btn;
  }

  const btnSelect = makeBtn(ICONS.select);
  const btnFill = makeBtn(ICONS.sparkles);
  const btnSettings = makeBtn(ICONS.settings);
  const btnMinimize = makeBtn(ICONS.close);

  btnFill.disabled = true;

  const badge = document.createElement("span");
  badge.className = "gf-badge";
  badge.style.display = "none";
  btnSelect.style.position = "relative";
  btnSelect.appendChild(badge);

  const dotWarn = document.createElement("span");
  dotWarn.className = "gf-dot-warn";
  btnSettings.style.position = "relative";
  btnSettings.appendChild(dotWarn);
  dotWarn.style.display = "none";

  const divider1 = document.createElement("span");
  divider1.className = "gf-divider";
  const divider2 = document.createElement("span");
  divider2.className = "gf-divider";

  bar.append(btnSelect, btnFill, divider1, btnSettings, divider2, btnMinimize);

  // ── Mini FAB ──
  const fab = document.createElement("button");
  fab.className = "gf-fab visible";
  fab.innerHTML = ICONS.ghost;
  fab.title = "GhostFill";
  // Restore saved fab position or default bottom-right
  const savedFabPos = (() => {
    try {
      const raw = localStorage.getItem(FAB_POS_KEY);
      if (raw) return JSON.parse(raw) as { x: number; y: number };
    } catch {}
    return null;
  })();
  // Always clamp to viewport — ignore stale saved positions
  if (savedFabPos) {
    const x = Math.min(savedFabPos.x, window.innerWidth - 60);
    const y = Math.min(savedFabPos.y, window.innerHeight - 60);
    fab.style.left = `${Math.max(8, x)}px`;
    fab.style.top = `${Math.max(8, y)}px`;
  } else {
    fab.style.right = "80px";
    fab.style.bottom = "80px";
  }
  shadow.appendChild(fab);

  function positionFab() {
    // Use last saved fab position, or fall back to bar center
    const savedFab = (() => {
      try {
        const raw = localStorage.getItem(FAB_POS_KEY);
        if (raw) return JSON.parse(raw) as { x: number; y: number };
      } catch {}
      return null;
    })();

    if (savedFab) {
      fab.style.left = `${savedFab.x}px`;
      fab.style.top = `${savedFab.y}px`;
    } else {
      const barRect = bar.getBoundingClientRect();
      fab.style.left = `${barRect.left + barRect.width / 2 - 22}px`;
      fab.style.top = `${barRect.top + barRect.height / 2 - 22}px`;
    }
    fab.style.bottom = "";
    fab.style.right = "";
  }

  // ── Drag ──
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let barStartX = 0;
  let barStartY = 0;
  let hasDragged = false;

  function onDragStart(e: MouseEvent) {
    isDragging = true;
    hasDragged = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const rect = bar.getBoundingClientRect();
    barStartX = rect.left;
    barStartY = rect.top;
    bar.style.transform = "none";
    bar.style.bottom = "";
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onDragEnd);
  }

  function onDragMove(e: MouseEvent) {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (!hasDragged && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      hasDragged = true;
      bar.classList.add("dragging");
    }
    if (!hasDragged) return;
    const barW = bar.offsetWidth;
    const barH = bar.offsetHeight;
    bar.style.left = `${Math.max(0, Math.min(window.innerWidth - barW, barStartX + dx))}px`;
    bar.style.top = `${Math.max(0, Math.min(window.innerHeight - barH, barStartY + dy))}px`;
  }

  function onDragEnd() {
    isDragging = false;
    bar.classList.remove("dragging");
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", onDragEnd);
    if (hasDragged) {
      const rect = bar.getBoundingClientRect();
      savePosition(rect.left, rect.top);
      repositionPopover();
      setTimeout(() => { hasDragged = false; }, 0);
    }
  }

  bar.addEventListener("mousedown", onDragStart);

  // ── Settings Popover ──
  const HIGHLIGHT_COLORS = [
    { color: "#8b5cf6", name: "Purple" },
    { color: "#3b82f6", name: "Blue" },
    { color: "#06b6d4", name: "Cyan" },
    { color: "#22c55e", name: "Green" },
    { color: "#eab308", name: "Yellow" },
    { color: "#f97316", name: "Orange" },
    { color: "#ef4444", name: "Red" },
  ];

  const settingsPop = document.createElement("div");
  settingsPop.className = "gf-popover";
  settingsPop.style.position = "fixed"; // needed for preset overlay absolute positioning
  settingsPop.innerHTML = `
    <div class="gf-pop-header">
      <h3><span class="gf-slash">/</span>ghostfill</h3>
      <div class="gf-header-right">
        <span class="gf-version">v0.2.1</span>
        <button class="gf-theme-btn" id="gf-s-theme" title="Toggle theme">
          ${saved.theme === "dark" ? ICONS.sun : ICONS.moon}
        </button>
      </div>
    </div>
    <div class="gf-pop-body">
      <div class="gf-field">
        <label class="gf-label">Highlight Colour</label>
        <div class="gf-colors" id="gf-s-colors">
          ${HIGHLIGHT_COLORS.map((c) =>
            `<div class="gf-color-dot${saved.highlightColor === c.color ? " selected" : ""}" data-color="${c.color}" style="background:${c.color}" title="${c.name}"></div>`
          ).join("")}
        </div>
      </div>
      <div class="gf-sep"></div>
      <div class="gf-field" style="flex-direction:row;align-items:center;justify-content:space-between">
        <label class="gf-label" style="margin:0">Use AI</label>
        <label class="gf-toggle">
          <input type="checkbox" id="gf-s-useai" ${saved.useAI ? "checked" : ""} />
          <span class="gf-toggle-slider"></span>
        </label>
      </div>
      <div id="gf-s-ai-section" style="display:${saved.useAI ? "flex" : "none"};flex-direction:column;gap:12px">
        <div class="gf-field" style="flex-direction:row;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:4px">
            <label class="gf-label" style="margin:0">Provider</label>
            <span class="gf-help" id="gf-s-help">?<span class="gf-help-tip" id="gf-s-help-tip"></span></span>
          </div>
          <div class="gf-picker" id="gf-s-provider-picker" tabindex="0">
            <span class="gf-picker-value" id="gf-s-provider-label">${PROVIDERS[saved.provider]?.label || "OpenAI"}</span>
            <div class="gf-cycle-dots" id="gf-s-provider-dots">
              <span class="gf-cycle-dot"></span>
              <span class="gf-cycle-dot"></span>
              <span class="gf-cycle-dot"></span>
            </div>
          </div>
        </div>
        <div class="gf-field">
          <label class="gf-label">API Key</label>
          <input type="password" class="gf-input gf-input-mono" id="gf-s-key" placeholder="sk-..." autocomplete="off" spellcheck="false" />
        </div>
        <div class="gf-sep"></div>
        <div class="gf-field">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:4px">
              <label class="gf-label" style="margin:0">Presets</label>
              <span class="gf-help" id="gf-s-presets-help">?<span class="gf-help-tip">Saved prompt templates that add context when filling. Select a preset in the Fill panel to use it automatically.</span></span>
            </div>
            <button class="gf-preset-chip add" id="gf-s-preset-add" style="font-size:10px;padding:2px 6px">+ Add</button>
          </div>
          <div class="gf-preset-list" id="gf-s-preset-list"></div>
        </div>
      </div>
      <button class="gf-save-btn" id="gf-s-save">Save</button>
    </div>
    <!-- Preset edit overlay — takes over entire panel -->
    <div class="gf-preset-overlay" id="gf-s-preset-form" style="display:none">
      <div class="gf-pop-header">
        <h3 id="gf-s-preset-form-title">New Preset</h3>
      </div>
      <div class="gf-preset-overlay-body">
        <div class="gf-field">
          <label class="gf-label">Name</label>
          <input class="gf-input" id="gf-s-preset-name" placeholder="e.g. D365, Healthcare, E-commerce" />
        </div>
        <div class="gf-field" style="flex:1;display:flex;flex-direction:column">
          <label class="gf-label">Prompt</label>
          <textarea class="gf-input" id="gf-s-preset-prompt" placeholder="Describe the context for this preset...&#10;&#10;e.g. Generate data for a Microsoft Dynamics 365 Customer Engagement implementation. Use CRM terminology, consulting project names, and Microsoft partner context." style="flex:1;min-height:120px;resize:none"></textarea>
        </div>
        <div class="gf-preset-form-actions">
          <button class="gf-preset-form-btn cancel" id="gf-s-preset-cancel">Cancel</button>
          <button class="gf-preset-form-btn save" id="gf-s-preset-save">Save Preset</button>
        </div>
      </div>
    </div>
  `;
  shadow.appendChild(settingsPop);

  const sKeyInput = settingsPop.querySelector<HTMLInputElement>("#gf-s-key")!;
  const sUseAIToggle = settingsPop.querySelector<HTMLInputElement>("#gf-s-useai")!;
  const sAISection = settingsPop.querySelector<HTMLDivElement>("#gf-s-ai-section")!;
  const sHelpEl = settingsPop.querySelector<HTMLSpanElement>("#gf-s-help")!;
  sKeyInput.value = saved.apiKey || "";
  const sSaveBtn = settingsPop.querySelector<HTMLButtonElement>("#gf-s-save")!;
  const sThemeBtn = settingsPop.querySelector<HTMLButtonElement>("#gf-s-theme")!;
  const sColorsDiv = settingsPop.querySelector<HTMLDivElement>("#gf-s-colors")!;
  const sPickerEl = settingsPop.querySelector<HTMLDivElement>("#gf-s-provider-picker")!;
  const sPickerLabel = settingsPop.querySelector<HTMLSpanElement>("#gf-s-provider-label")!;
  const sProviderDots = settingsPop.querySelector<HTMLDivElement>("#gf-s-provider-dots")!;
  const sHelpTip = settingsPop.querySelector<HTMLSpanElement>("#gf-s-help-tip")!;
  const sPresetsHelp = settingsPop.querySelector<HTMLSpanElement>("#gf-s-presets-help")!;

  // ── Provider picker — click to cycle ──
  const providerOrder: Provider[] = ["openai", "xai", "moonshot"];
  let selectedProvider: Provider = saved.provider || aiConfig?.provider || "openai";

  function updateProviderDots() {
    const idx = providerOrder.indexOf(selectedProvider);
    sProviderDots.querySelectorAll(".gf-cycle-dot").forEach((dot, i) => {
      dot.classList.toggle("active", i === idx);
    });
  }

  function updateProviderDisplay() {
    const p = PROVIDERS[selectedProvider] || PROVIDERS.openai;
    sPickerLabel.textContent = `${p.label} (${p.model})`;
    sHelpTip.textContent = p.helpText;
    updateProviderDots();
  }
  updateProviderDisplay();

  sPickerEl.addEventListener("click", () => {
    const idx = providerOrder.indexOf(selectedProvider);
    selectedProvider = providerOrder[(idx + 1) % providerOrder.length]!;
    updateProviderDisplay();
  });

  // ── Help icons — toggle on click ──
  sHelpEl.addEventListener("click", (e) => {
    e.stopPropagation();
    sHelpTip.classList.toggle("show");
  });
  sPresetsHelp.addEventListener("click", (e) => {
    e.stopPropagation();
    sPresetsHelp.querySelector(".gf-help-tip")!.classList.toggle("show");
  });
  // Close help tips when clicking elsewhere
  shadow.addEventListener("click", () => {
    sHelpTip.classList.remove("show");
    sPresetsHelp.querySelector(".gf-help-tip")?.classList.remove("show");
  });
  sPickerEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      sPickerEl.click();
    }
  });

  // Toggle AI section
  sUseAIToggle.addEventListener("change", () => {
    sAISection.style.display = sUseAIToggle.checked ? "flex" : "none";
  });

  // ── Highlight color selection ──
  let currentHighlightColor = saved.highlightColor || "#6366f1";
  sColorsDiv.addEventListener("click", (e) => {
    const dot = (e.target as HTMLElement).closest(".gf-color-dot") as HTMLElement;
    if (!dot) return;
    sColorsDiv.querySelectorAll(".gf-color-dot").forEach((d) => d.classList.remove("selected"));
    dot.classList.add("selected");
    currentHighlightColor = dot.dataset.color || "#6366f1";
  });

  // ── Theme toggle ──
  let currentTheme = saved.theme || "dark";

  function applyTheme(theme: "dark" | "light") {
    currentTheme = theme;
    const isDark = theme === "dark";
    sThemeBtn.innerHTML = isDark ? ICONS.sun : ICONS.moon;

    const bg = isDark ? "#1a1a1a" : "#ffffff";
    const bgInput = isDark ? "rgba(255,255,255,0.06)" : "#f4f4f5";
    const border = isDark ? "rgba(255,255,255,0.07)" : "#d4d4d8";
    const text = isDark ? "#fff" : "#18181b";
    const textMuted = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
    const textDim = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)";
    const btnHoverBg = isDark ? "#27272a" : "#e4e4e7";
    const btnActiveBg = isDark ? "#3f3f46" : "#d4d4d8";
    const presetItemBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
    const presetItemText = isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)";
    const presetBtnColor = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)";
    const helpBg = isDark ? "#3f3f46" : "#d4d4d8";
    const helpColor = isDark ? "#a1a1aa" : "#52525b";
    const pickerColor = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.75)";

    for (const pop of [settingsPop, promptPop]) {
      pop.style.background = bg;
      pop.style.boxShadow = isDark
        ? "0 4px 20px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.08)"
        : "0 4px 20px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.08)";
      pop.querySelectorAll<HTMLElement>(".gf-pop-header h3").forEach((el) => el.style.color = text);
      pop.querySelectorAll<HTMLElement>(".gf-pop-header").forEach((el) => el.style.borderBottomColor = border);
      pop.querySelectorAll<HTMLElement>(".gf-label").forEach((el) => el.style.color = textMuted);
      pop.querySelectorAll<HTMLElement>(".gf-note").forEach((el) => el.style.color = textMuted);
      pop.querySelectorAll<HTMLElement>(".gf-input").forEach((el) => {
        el.style.background = bgInput;
        el.style.borderColor = border;
        el.style.color = text;
      });
      pop.querySelectorAll<HTMLElement>(".gf-sep").forEach((el) => el.style.background = border);
      pop.querySelectorAll<HTMLElement>(".gf-version").forEach((el) => el.style.color = textDim);
      pop.querySelectorAll<HTMLElement>(".gf-field-count").forEach((el) => el.style.color = textMuted);
      pop.querySelectorAll<HTMLElement>(".gf-fc-label").forEach((el) => el.style.color = isDark ? "#d4d4d8" : "#3f3f46");
      pop.querySelectorAll<HTMLElement>(".gf-field-card").forEach((el) => {
        el.style.background = isDark ? "#27272a" : "#f4f4f5";
        el.style.borderColor = border;
      });
      // Preset pills — colors are inline, no theme override needed
      // Help badge
      pop.querySelectorAll<HTMLElement>(".gf-help").forEach((el) => { el.style.background = helpBg; el.style.color = helpColor; });
      // Picker value
      pop.querySelectorAll<HTMLElement>(".gf-picker-value").forEach((el) => el.style.color = pickerColor);
      // Theme button
      pop.querySelectorAll<HTMLElement>(".gf-theme-btn").forEach((el) => el.style.color = textDim);
    }

    bar.style.background = bg;
    bar.style.boxShadow = isDark
      ? "0 8px 32px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06)"
      : "0 4px 16px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.06)";
    bar.querySelectorAll<HTMLElement>(".gf-bar-btn").forEach((btn) => {
      btn.style.color = textMuted;
      const isActive = btn.classList.contains("active");
      btn.style.background = isActive ? btnActiveBg : "transparent";
      btn.onmouseenter = () => { btn.style.background = btnHoverBg; btn.style.color = text; };
      btn.onmouseleave = () => {
        const stillActive = btn.classList.contains("active");
        btn.style.background = stillActive ? btnActiveBg : "transparent";
        btn.style.color = stillActive ? text : textMuted;
      };
    });
    bar.querySelectorAll<HTMLElement>(".gf-divider").forEach((el) => el.style.background = border);

    fab.style.background = bg;
    fab.style.color = textMuted;
    fab.style.boxShadow = isDark
      ? "0 4px 16px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06)"
      : "0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.06)";
  }

  // ── Prompt Popover ──
  const promptPop = document.createElement("div");
  promptPop.className = "gf-popover";
  promptPop.style.width = "300px";
  promptPop.innerHTML = `
    <div class="gf-pop-header">
      <h3>Fill Fields</h3>
      <span class="gf-field-count" id="gf-p-count">0 fields</span>
    </div>
    <div class="gf-pop-body">
      <div id="gf-p-fields-wrap" style="display:none">
        <div class="gf-fields-grid" id="gf-p-grid"></div>
      </div>
      <div class="gf-field" id="gf-p-preset-row" style="display:none;flex-direction:row;align-items:center;justify-content:space-between">
        <label class="gf-label" style="margin:0">Preset</label>
        <div class="gf-picker" id="gf-p-preset-picker">
          <span class="gf-picker-value" id="gf-p-preset-label">None</span>
          <div class="gf-cycle-dots" id="gf-p-preset-dots"></div>
        </div>
      </div>
      <div class="gf-field" id="gf-p-prompt-wrap">
        <textarea class="gf-input" id="gf-p-prompt" placeholder="Optional: describe the data you want&#10;Leave empty for auto-generated data" rows="2"></textarea>
      </div>
      <button class="gf-fill-btn" id="gf-p-fill">
        ${ICONS.sparkles} Fill
      </button>
      <div class="gf-status info" id="gf-p-status"></div>
    </div>
  `;
  shadow.appendChild(promptPop);

  const pCountEl = promptPop.querySelector<HTMLSpanElement>("#gf-p-count")!;
  const pFieldsWrap = promptPop.querySelector<HTMLDivElement>("#gf-p-fields-wrap")!;
  const pFieldGrid = promptPop.querySelector<HTMLDivElement>("#gf-p-grid")!;
  const pPresetRow = promptPop.querySelector<HTMLDivElement>("#gf-p-preset-row")!;
  const pPresetPicker = promptPop.querySelector<HTMLDivElement>("#gf-p-preset-picker")!;
  const pPresetLabel = promptPop.querySelector<HTMLSpanElement>("#gf-p-preset-label")!;
  const pPresetDots = promptPop.querySelector<HTMLDivElement>("#gf-p-preset-dots")!;
  const pPromptWrap = promptPop.querySelector<HTMLDivElement>("#gf-p-prompt-wrap")!;
  const pPromptEl = promptPop.querySelector<HTMLTextAreaElement>("#gf-p-prompt")!;
  const pFillBtn = promptPop.querySelector<HTMLButtonElement>("#gf-p-fill")!;
  const pStatusEl = promptPop.querySelector<HTMLDivElement>("#gf-p-status")!;

  let presets: Preset[] = saved.presets || [];
  let activePresetId: string | null = saved.activePresetId || null;

  function updateFillPresetUI() {
    if (presets.length === 0) {
      pPresetRow.style.display = "none";
      pPromptWrap.style.display = "flex";
      activePresetId = null;
      return;
    }
    pPresetRow.style.display = "flex";

    // Find active preset
    const active = activePresetId ? presets.find((p) => p.id === activePresetId) : null;
    pPresetLabel.textContent = active ? active.name : "None";

    // Render cycle dots: None + each preset
    const totalOptions = presets.length + 1; // +1 for "None"
    const activeIdx = activePresetId ? presets.findIndex((p) => p.id === activePresetId) + 1 : 0;
    pPresetDots.innerHTML = "";
    for (let i = 0; i < totalOptions; i++) {
      const dot = document.createElement("span");
      dot.className = `gf-cycle-dot${i === activeIdx ? " active" : ""}`;
      pPresetDots.appendChild(dot);
    }

    // Hide prompt textarea when a preset is active
    pPromptWrap.style.display = active ? "none" : "flex";
  }

  function persistActivePreset() {
    const s = loadSettings(aiConfig?.provider || "openai");
    s.activePresetId = activePresetId;
    saveSettings(s);
  }

  // Click to cycle: None → preset1 → preset2 → ... → None
  pPresetPicker.addEventListener("click", () => {
    if (presets.length === 0) return;
    if (!activePresetId) {
      activePresetId = presets[0]!.id;
    } else {
      const idx = presets.findIndex((p) => p.id === activePresetId);
      if (idx < presets.length - 1) {
        activePresetId = presets[idx + 1]!.id;
      } else {
        activePresetId = null;
      }
    }
    persistActivePreset();
    updateFillPresetUI();
  });

  updateFillPresetUI();

  if (currentTheme === "light") applyTheme("light");

  sThemeBtn.addEventListener("click", () => {
    applyTheme(currentTheme === "dark" ? "light" : "dark");
  });

  function setStatus(text: string, type: "info" | "success" | "error") {
    pStatusEl.textContent = text;
    pStatusEl.className = `gf-status ${type}`;
  }

  function clearStatus() {
    pStatusEl.textContent = "";
    pStatusEl.className = "gf-status info";
  }

  // ── Popover positioning ──
  function repositionPopover() {
    const barRect = bar.getBoundingClientRect();
    const popCenterX = barRect.left + barRect.width / 2;
    const popBottom = barRect.top - 8;
    for (const pop of [settingsPop, promptPop]) {
      pop.style.position = "fixed";
      pop.style.bottom = "";
      pop.style.left = `${popCenterX}px`;
      pop.style.top = `${popBottom}px`;
      pop.style.transform = "translate(-50%, -100%)";
    }
  }

  type PopoverName = "settings" | "prompt" | null;
  let currentPopover: PopoverName = null;

  function openPopover(name: PopoverName) {
    settingsPop.classList.remove("open");
    promptPop.classList.remove("open");
    btnSettings.classList.remove("active");
    btnFill.classList.remove("active");
    if (name === currentPopover || name === null) { currentPopover = null; return; }
    repositionPopover();
    currentPopover = name;
    if (name === "settings") {
      settingsPop.classList.add("open");
      btnSettings.classList.add("active");
      (aiConfig && sUseAIToggle.checked ? sPickerEl : sSaveBtn).focus();
    } else if (name === "prompt") {
      promptPop.classList.add("open");
      btnFill.classList.add("active");
      pPromptEl.focus();
    }
  }

  // ── Block highlight ──
  let blockHighlight: HTMLDivElement | null = null;

  function highlightBlock(el: HTMLElement) {
    removeBlockHighlight();
    blockHighlight = document.createElement("div");
    blockHighlight.id = "ghostfill-block-highlight";
    const rect = el.getBoundingClientRect();
    const c = currentHighlightColor;
    Object.assign(blockHighlight.style, {
      position: "fixed", top: `${rect.top}px`, left: `${rect.left}px`,
      width: `${rect.width}px`, height: `${rect.height}px`,
      border: `2px solid ${c}`, borderRadius: "6px",
      backgroundColor: `${c}0d`,
      pointerEvents: "none", zIndex: "2147483644", transition: "all 0.2s",
    });
    document.body.appendChild(blockHighlight);
  }

  function removeBlockHighlight() {
    blockHighlight?.remove();
    blockHighlight = null;
  }

  function fieldTypeIcon(type: string): string {
    switch (type) {
      case "email": return ICONS.ftEmail;
      case "tel": return ICONS.ftPhone;
      case "number": case "range": return ICONS.ftNumber;
      case "date": case "datetime-local": case "time": case "month": case "week": return ICONS.ftDate;
      case "select": return ICONS.ftSelect;
      case "textarea": return ICONS.ftTextarea;
      case "checkbox": return ICONS.ftCheckbox;
      case "radio": return ICONS.ftRadio;
      case "url": return ICONS.ftUrl;
      case "password": return ICONS.ftPassword;
      case "file": return ICONS.ftFile;
      default: return ICONS.ftText;
    }
  }

  // Track field highlight so we can remove it
  let fieldHighlightEl: HTMLElement | null = null;
  function highlightField(el: HTMLElement) {
    clearFieldHighlight();
    el.style.outline = `2px solid ${currentHighlightColor}`;
    el.style.outlineOffset = "2px";
    el.style.transition = "outline 0.15s, outline-offset 0.15s";
    fieldHighlightEl = el;
  }
  function clearFieldHighlight() {
    if (fieldHighlightEl) {
      fieldHighlightEl.style.outline = "";
      fieldHighlightEl.style.outlineOffset = "";
      fieldHighlightEl = null;
    }
  }

  function showFieldsInPrompt(fields: DetectedField[]) {
    pCountEl.textContent = `${fields.length} field${fields.length === 1 ? "" : "s"}`;
    pFieldGrid.innerHTML = "";
    fields.forEach((f) => {
      const card = document.createElement("div");
      card.className = "gf-field-card";

      const icon = document.createElement("span");
      icon.className = "gf-fc-icon";
      icon.innerHTML = fieldTypeIcon(f.type);

      const label = document.createElement("span");
      label.className = "gf-fc-label";
      label.textContent = f.label;

      card.appendChild(icon);
      card.appendChild(label);

      if (f.required) {
        const req = document.createElement("span");
        req.className = "gf-fc-req";
        req.textContent = "*";
        card.appendChild(req);
      }

      // Hover → highlight the actual field on the page
      card.addEventListener("mouseenter", () => highlightField(f.element));
      card.addEventListener("mouseleave", () => clearFieldHighlight());

      pFieldGrid.appendChild(card);
    });
    pFieldsWrap.style.display = "block";
  }

  let cleanupSelector: (() => void) | null = null;

  // ── Button: Select ──
  btnSelect.addEventListener("click", () => {
    if (hasDragged) return;
    if (state.selecting) {
      cleanupSelector?.();
      cleanupSelector = null;
      state.selecting = false;
      btnSelect.classList.remove("active");
      return;
    }
    openPopover(null);
    state.selecting = true;
    btnSelect.classList.add("active");

    cleanupSelector = startSelection(
      (element) => {
        state.selecting = false;
        state.selectedBlock = element;
        btnSelect.classList.remove("active");
        cleanupSelector = null;
        const fields = detectFields(element);
        state.fields = fields;
        if (fields.length === 0) {
          badge.style.display = "none";
          btnFill.disabled = true;
          return;
        }
        highlightBlock(element);
        showFieldsInPrompt(fields);
        badge.textContent = String(fields.length);
        badge.style.display = "flex";
        btnFill.disabled = false;
        // Auto-open fill popover
        openPopover("prompt");
      },
      () => {
        state.selecting = false;
        btnSelect.classList.remove("active");
        cleanupSelector = null;
      },
      host,
      currentHighlightColor
    );
  });

  // ── Button: Fill ──
  btnFill.addEventListener("click", () => {
    if (hasDragged) return;
    if (state.fields.length === 0) return;
    openPopover("prompt");
  });

  // ── Button: Settings ──
  btnSettings.addEventListener("click", () => {
    if (hasDragged) return;
    openPopover("settings");
  });

  // ── Button: Close (minimize) ──
  btnMinimize.addEventListener("click", () => {
    if (hasDragged) return;
    openPopover(null);
    removeBlockHighlight();
    cleanupSelector?.();
    state.selecting = false;
    state.selectedBlock = null;
    state.fields = [];
    badge.style.display = "none";
    btnFill.disabled = true;
    positionFab();
    bar.style.display = "none";
    fab.classList.add("visible");
    state.active = false;
  });

  // ── FAB: drag + click ──
  let fabDragState = { dragging: false, moved: false, startX: 0, startY: 0, fabX: 0, fabY: 0 };

  function onFabMouseDown(e: MouseEvent) {
    fabDragState = {
      dragging: true, moved: false,
      startX: e.clientX, startY: e.clientY,
      fabX: fab.getBoundingClientRect().left,
      fabY: fab.getBoundingClientRect().top,
    };
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - fabDragState.startX;
      const dy = ev.clientY - fabDragState.startY;
      if (!fabDragState.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) fabDragState.moved = true;
      if (!fabDragState.moved) return;
      fab.style.left = `${Math.max(0, Math.min(window.innerWidth - 44, fabDragState.fabX + dx))}px`;
      fab.style.top = `${Math.max(0, Math.min(window.innerHeight - 44, fabDragState.fabY + dy))}px`;
      fab.style.right = "";
      fab.style.bottom = "";
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      fabDragState.dragging = false;
      if (fabDragState.moved) {
        try {
          localStorage.setItem(
            FAB_POS_KEY,
            JSON.stringify({
              x: fab.getBoundingClientRect().left,
              y: fab.getBoundingClientRect().top,
            })
          );
        } catch {}
      }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
  fab.addEventListener("mousedown", onFabMouseDown);

  fab.addEventListener("click", () => {
    if (fabDragState.moved) { fabDragState.moved = false; return; }
    fab.classList.remove("visible");
    bar.style.left = fab.style.left || `${window.innerWidth - 250}px`;
    bar.style.top = fab.style.top || `${window.innerHeight - 80}px`;
    bar.style.transform = "none";
    bar.style.bottom = "";
    bar.style.display = "flex";
    state.active = true;
    // Auto-start selection mode after a tick
    setTimeout(() => btnSelect.click(), 50);
  });

  // ── Preset management ──
  const sPresetList = settingsPop.querySelector<HTMLDivElement>("#gf-s-preset-list")!;
  const sPresetForm = settingsPop.querySelector<HTMLDivElement>("#gf-s-preset-form")!;
  const sPresetFormTitle = settingsPop.querySelector<HTMLHeadingElement>("#gf-s-preset-form-title")!;
  const sPresetAddBtn = settingsPop.querySelector<HTMLButtonElement>("#gf-s-preset-add")!;
  const sPresetName = settingsPop.querySelector<HTMLInputElement>("#gf-s-preset-name")!;
  const sPresetPrompt = settingsPop.querySelector<HTMLTextAreaElement>("#gf-s-preset-prompt")!;
  const sPresetSaveBtn = settingsPop.querySelector<HTMLButtonElement>("#gf-s-preset-save")!;
  const sPresetCancelBtn = settingsPop.querySelector<HTMLButtonElement>("#gf-s-preset-cancel")!;

  let editingPresetId: string | null = null;

  // Preset pill colors — cycle through these
  const PILL_COLORS = [
    { bg: "rgba(99,102,241,0.15)", border: "rgba(99,102,241,0.3)", text: "#a5b4fc" },
    { bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.25)", text: "#6ee7b7" },
    { bg: "rgba(251,146,60,0.12)", border: "rgba(251,146,60,0.25)", text: "#fdba74" },
    { bg: "rgba(244,114,182,0.12)", border: "rgba(244,114,182,0.25)", text: "#f9a8d4" },
    { bg: "rgba(56,189,248,0.12)", border: "rgba(56,189,248,0.25)", text: "#7dd3fc" },
    { bg: "rgba(163,130,255,0.12)", border: "rgba(163,130,255,0.25)", text: "#c4b5fd" },
    { bg: "rgba(250,204,21,0.12)", border: "rgba(250,204,21,0.25)", text: "#fde68a" },
  ];

  function renderPresetList() {
    sPresetList.innerHTML = "";
    presets.forEach((p, i) => {
      const c = PILL_COLORS[i % PILL_COLORS.length]!;
      const pill = document.createElement("span");
      pill.className = "gf-preset-pill";
      pill.style.background = c.bg;
      pill.style.borderColor = c.border;
      pill.style.color = c.text;

      const name = document.createElement("span");
      name.className = "gf-pp-name";
      name.textContent = p.name;
      name.title = "Click to edit";
      name.addEventListener("click", () => {
        editingPresetId = p.id;
        sPresetFormTitle.textContent = "Edit Preset";
        sPresetForm.style.display = "flex";
        sPresetName.value = p.name;
        sPresetPrompt.value = p.prompt;
        sPresetName.focus();
      });

      const x = document.createElement("button");
      x.className = "gf-pp-x";
      x.innerHTML = "&times;";
      x.style.color = c.text;
      x.title = "Delete";
      x.addEventListener("click", (e) => {
        e.stopPropagation();
        presets = presets.filter((v) => v.id !== p.id);
        if (activePresetId === p.id) activePresetId = null;
        renderPresetList();
        updateFillPresetUI();
        const s = loadSettings(aiConfig?.provider || "openai");
        s.presets = presets;
        s.activePresetId = activePresetId;
        saveSettings(s);
      });

      pill.append(name, x);
      sPresetList.appendChild(pill);
    });
  }
  renderPresetList();

  sPresetAddBtn.addEventListener("click", () => {
    editingPresetId = null;
    sPresetFormTitle.textContent = "New Preset";
    sPresetForm.style.display = "flex";
    sPresetName.value = "";
    sPresetPrompt.value = "";
    sPresetName.focus();
  });

  sPresetCancelBtn.addEventListener("click", () => {
    sPresetForm.style.display = "none";
    editingPresetId = null;
  });

  sPresetSaveBtn.addEventListener("click", () => {
    const name = sPresetName.value.trim();
    const prompt = sPresetPrompt.value.trim();
    if (!name || !prompt) return;
    if (editingPresetId) {
      // Update existing
      const idx = presets.findIndex((p) => p.id === editingPresetId);
      if (idx >= 0) presets[idx] = { ...presets[idx]!, name, prompt };
    } else {
      // Add new
      presets.push({ id: Date.now().toString(36), name, prompt });
    }
    editingPresetId = null;
    sPresetForm.style.display = "none";
    renderPresetList();
    updateFillPresetUI();
  });

  // ── Settings: Save ──
  sSaveBtn.addEventListener("click", () => {
    const s: GhostFillSettings = {
      apiKey: sKeyInput.value.trim(),
      provider: selectedProvider,
      highlightColor: currentHighlightColor,
      theme: currentTheme,
      useAI: sUseAIToggle.checked,
      presets,
      activePresetId,
    };
    saveSettings(s);
    dotWarn.style.display = "none";
    openPopover(null);
  });

  // ── Prompt: Fill ──
  async function doFill() {
    const settings = loadSettings(aiConfig?.provider || "openai");
    // Build prompt: preset + user text
    const activePreset = activePresetId
      ? (settings.presets || []).find((p) => p.id === activePresetId)
      : null;
    const userText = pPromptEl.value.trim();
    const promptText = [activePreset?.prompt, userText].filter(Boolean).join("\n\n");

    if (state.fields.length === 0) return;

    pFillBtn.disabled = true;
    pFillBtn.innerHTML = `<span class="gf-spin">${ICONS.spinner}</span> Filling...`;
    clearStatus();

    try {
      let fillData;

      if (settings.useAI) {
        if (!settings.apiKey) {
          setStatus("Set your API key in Settings first", "error");
          pFillBtn.disabled = false;
          pFillBtn.innerHTML = `${ICONS.sparkles} Fill`;
          return;
        }
        // Call provider API directly with the user's API key
        const provider = PROVIDERS[settings.provider] || PROVIDERS.openai;
        // Extract page context inline
        let blockContext = `Page: ${document.title}`;
        if (state.selectedBlock) {
          state.selectedBlock.querySelectorAll("h1,h2,h3,h4,label,legend").forEach((el) => {
            const t = el.textContent?.trim();
            if (t && t.length < 80) blockContext += `\n${t}`;
          });
        }
        const fieldDesc = describeFields(state.fields);
        let userContent = `Form fields:\n${fieldDesc}`;
        if (blockContext) userContent += `\n\nPage context:\n${blockContext}`;
        if (promptText) userContent += `\n\nUser instructions: ${promptText}`;
        else userContent += `\n\nNo specific instructions — generate realistic, contextually appropriate data for all fields.`;

        const resp = await fetch(`${provider.baseURL}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}` },
          body: JSON.stringify({
            model: provider.model,
            messages: [
              { role: "system", content: `You are a form-filling assistant. Return ONLY a JSON object with a "fields" array of objects, each with "index" and "value" keys. Fill EVERY field. For select fields pick from listed options EXACTLY. For checkboxes add "checked" boolean. Generate coherent data. No markdown code blocks.` },
              { role: "user", content: userContent },
            ],
            temperature: 0.7,
            ...(settings.provider === "openai" ? { response_format: { type: "json_object" } } : {}),
          }),
        });
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content || "";
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
        const parsed = JSON.parse(jsonMatch[1]!.trim());
        fillData = Array.isArray(parsed) ? parsed : parsed.fields || parsed.data || parsed.items || [];
      } else {
        // Local faker mode — instant, no API call
        fillData = generateFakeData(state.fields);
      }

      const { filled, errors } = await fillFields(state.fields, fillData);

      if (errors.length > 0) {
        setStatus(`Filled ${filled}/${state.fields.length} fields`, filled > 0 ? "success" : "error");
      } else {
        setStatus(`Filled ${filled} field${filled === 1 ? "" : "s"}`, "success");
      }
      // Success animation on the selected block
      if (state.selectedBlock) {
        const el = state.selectedBlock;
        el.style.transition = "box-shadow 0.8s ease";
        el.style.animation = "none";
        // Create a temporary overlay for the ripple effect
        const rect = el.getBoundingClientRect();
        const ripple = document.createElement("div");
        Object.assign(ripple.style, {
          position: "fixed", top: `${rect.top}px`, left: `${rect.left}px`,
          width: `${rect.width}px`, height: `${rect.height}px`,
          borderRadius: "6px", pointerEvents: "none", zIndex: "2147483644",
          border: "2px solid rgba(52,211,153,0.6)",
          boxShadow: "0 0 0 0 rgba(52,211,153,0.4), inset 0 0 20px rgba(52,211,153,0.08)",
          animation: "none",
        });
        document.body.appendChild(ripple);
        // Animate
        requestAnimationFrame(() => {
          ripple.style.transition = "box-shadow 0.8s ease, border-color 0.8s ease, opacity 0.8s ease";
          ripple.style.boxShadow = "0 0 0 8px rgba(52,211,153,0), inset 0 0 0 rgba(52,211,153,0)";
          ripple.style.borderColor = "rgba(52,211,153,0)";
          ripple.style.opacity = "0";
        });
        setTimeout(() => { ripple.remove(); }, 1000);
      }
      removeBlockHighlight();
      setTimeout(() => openPopover(null), 800);
    } catch (err) {
      setStatus(cleanError(err), "error");
    } finally {
      pFillBtn.disabled = false;
      pFillBtn.innerHTML = `${ICONS.sparkles} Fill`;
    }
  }

  pFillBtn.addEventListener("click", doFill);
  pPromptEl.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); doFill(); }
  });

  // ── Keyboard shortcut ──
  const shortcut = options.shortcut || "Alt+G";
  const keys = shortcut.toLowerCase().split("+");
  function handleShortcut(e: KeyboardEvent) {
    const mainKey = keys.filter(
      (k) => !["alt", "ctrl", "control", "shift", "meta", "cmd"].includes(k)
    )[0];
    const match =
      (keys.includes("alt") ? e.altKey : !e.altKey) &&
      (keys.includes("ctrl") || keys.includes("control") ? e.ctrlKey : !e.ctrlKey) &&
      (keys.includes("shift") ? e.shiftKey : !e.shiftKey) &&
      (keys.includes("meta") || keys.includes("cmd") ? e.metaKey : !e.metaKey) &&
      e.key.toLowerCase() === mainKey;
    if (match) {
      e.preventDefault();
      if (state.active) {
        openPopover(null);
        positionFab();
        bar.style.display = "none";
        fab.classList.add("visible");
        state.active = false;
      } else {
        fab.classList.remove("visible");
        bar.style.display = "flex";
        state.active = true;
      }
    }
  }
  document.addEventListener("keydown", handleShortcut);

  // Esc: close popover first, then minimize bar
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (currentPopover) {
      e.preventDefault();
      openPopover(null);
      return;
    }
    if (state.active) {
      e.preventDefault();
      btnMinimize.click();
    }
  });

  function destroy() {
    cleanupSelector?.();
    removeBlockHighlight();
    document.removeEventListener("keydown", handleShortcut);
    host.remove();
  }

  return { state, destroy };
}
