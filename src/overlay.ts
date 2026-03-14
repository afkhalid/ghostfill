import type { GhostFillOptions, GhostFillState, GhostFillSettings, DetectedField } from "./types";
import { detectFields } from "./detector";
import { generateFillData } from "./ai";
import { fillFields } from "./filler";
import { startSelection } from "./selector";

const STORAGE_KEY = "ghostfill_settings";

function loadSettings(): GhostFillSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { apiKey: "", model: "gpt-4o-mini", baseURL: "" };
}

function saveSettings(s: GhostFillSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

// ─── Icons (24x24 SVG paths) ────────────────────────────────────────────────

const ICONS = {
  select: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
    <circle cx="12" cy="12" r="4"/>
  </svg>`,
  eye: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>`,
  fill: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>`,
  settings: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
  </svg>`,
  close: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,
  ghost: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2C7.58 2 4 5.58 4 10v10l2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2V10c0-4.42-3.58-8-8-8z"/>
    <circle cx="9" cy="10" r="1.5" fill="currentColor"/>
    <circle cx="15" cy="10" r="1.5" fill="currentColor"/>
  </svg>`,
  check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>`,
  spinner: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <path d="M12 2a10 10 0 0 1 10 10"/>
  </svg>`,
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

  /* ── Bottom toolbar ── */
  .gf-bar {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483646;
    display: flex;
    align-items: center;
    gap: 2px;
    background: #18181b;
    border-radius: 14px;
    padding: 5px 6px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06);
    user-select: none;
  }

  .gf-bar-btn {
    position: relative;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: #a1a1aa;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, color 0.15s;
  }
  .gf-bar-btn:hover {
    background: #27272a;
    color: #fafafa;
  }
  .gf-bar-btn.active {
    background: #3f3f46;
    color: #fafafa;
  }
  .gf-bar-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .gf-bar-btn:disabled:hover {
    background: transparent;
    color: #a1a1aa;
  }

  .gf-divider {
    width: 1px;
    height: 20px;
    background: #3f3f46;
    margin: 0 4px;
    flex-shrink: 0;
  }

  /* Tooltip */
  .gf-bar-btn::after {
    content: attr(data-tooltip);
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    padding: 4px 10px;
    background: #09090b;
    color: #e4e4e7;
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
    border-radius: 6px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }
  .gf-bar-btn:hover::after {
    opacity: 1;
  }

  /* ── Popover (settings / prompt / fields) ── */
  .gf-popover {
    position: fixed;
    bottom: 72px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483646;
    width: 340px;
    background: #18181b;
    border-radius: 14px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06);
    display: none;
    flex-direction: column;
    overflow: hidden;
    animation: gf-pop-in 0.15s ease;
  }
  .gf-popover.open { display: flex; }

  @keyframes gf-pop-in {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  .gf-pop-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px 10px;
  }
  .gf-pop-header h3 {
    font-size: 13px;
    font-weight: 600;
    color: #fafafa;
    letter-spacing: 0.01em;
  }
  .gf-pop-header .gf-version {
    font-size: 11px;
    color: #52525b;
    font-weight: 400;
  }

  .gf-pop-body {
    padding: 0 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 400px;
    overflow-y: auto;
  }

  .gf-sep {
    height: 1px;
    background: #27272a;
    margin: 0 -16px;
  }

  /* ── Form elements ── */
  .gf-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .gf-label {
    font-size: 12px;
    font-weight: 500;
    color: #a1a1aa;
  }
  .gf-input {
    width: 100%;
    padding: 8px 10px;
    background: #09090b;
    border: 1px solid #27272a;
    border-radius: 8px;
    color: #fafafa;
    font-family: inherit;
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
  }
  .gf-input:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99,102,241,0.15);
  }
  .gf-input::placeholder {
    color: #52525b;
  }
  .gf-input-mono {
    font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
    font-size: 12px;
    letter-spacing: -0.02em;
  }

  select.gf-input {
    appearance: none;
    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2371717a' viewBox='0 0 16 16'%3e%3cpath d='M4.646 6.646a.5.5 0 0 1 .708 0L8 9.293l2.646-2.647a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 0 1 0-.708z'/%3e%3c/svg%3e");
    background-repeat: no-repeat;
    background-position: right 10px center;
    padding-right: 28px;
  }

  textarea.gf-input {
    min-height: 56px;
    resize: vertical;
    line-height: 1.5;
  }

  .gf-save-btn {
    width: 100%;
    padding: 8px;
    border: none;
    border-radius: 8px;
    background: #6366f1;
    color: white;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .gf-save-btn:hover { background: #4f46e5; }

  .gf-fill-btn {
    width: 100%;
    padding: 8px;
    border: none;
    border-radius: 8px;
    background: #6366f1;
    color: white;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .gf-fill-btn:hover { background: #4f46e5; }
  .gf-fill-btn:disabled {
    background: #27272a;
    color: #52525b;
    cursor: not-allowed;
  }

  /* ── Status toast ── */
  .gf-toast {
    position: fixed;
    bottom: 72px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483647;
    padding: 8px 16px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s, transform 0.2s;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }
  .gf-toast.show {
    opacity: 1;
  }
  .gf-toast.info { background: #1e3a5f; color: #93c5fd; }
  .gf-toast.success { background: #14532d; color: #86efac; }
  .gf-toast.error { background: #7f1d1d; color: #fca5a5; }
  .gf-toast.selecting { background: #3b0764; color: #c4b5fd; }

  /* ── Field list ── */
  .gf-field-list {
    list-style: none;
    max-height: 100px;
    overflow-y: auto;
    background: #09090b;
    border-radius: 8px;
    padding: 6px 0;
  }
  .gf-field-list li {
    padding: 3px 10px;
    font-size: 11px;
    color: #a1a1aa;
  }
  .gf-field-list li:nth-child(odd) { background: rgba(255,255,255,0.02); }

  .gf-field-count {
    font-size: 11px;
    color: #71717a;
    padding: 2px 0;
  }

  /* ── Saved indicator ── */
  .gf-saved {
    font-size: 11px;
    color: #22c55e;
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .gf-saved.show { opacity: 1; }

  /* ── Spinner ── */
  .gf-spin {
    animation: gf-spin 0.7s linear infinite;
  }
  @keyframes gf-spin { to { transform: rotate(360deg); } }

  /* ── Badge (field count on select button) ── */
  .gf-badge {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 14px;
    height: 14px;
    border-radius: 7px;
    background: #6366f1;
    color: white;
    font-size: 9px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  /* ── No-key warning dot ── */
  .gf-dot-warn {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 6px;
    height: 6px;
    border-radius: 3px;
    background: #f59e0b;
  }
`;

// ─── Build UI ───────────────────────────────────────────────────────────────

export function createOverlay(options: GhostFillOptions): {
  state: GhostFillState;
  destroy: () => void;
} {
  // Merge options into saved settings
  const saved = loadSettings();
  if (options.apiKey && !saved.apiKey) {
    saved.apiKey = options.apiKey;
    saveSettings(saved);
  }
  if (options.model && !saved.model) saved.model = options.model;
  if (options.baseURL && !saved.baseURL) saved.baseURL = options.baseURL;

  // Shadow host
  const host = document.createElement("div");
  host.id = "ghostfill-root";
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = CSS;
  shadow.appendChild(style);

  const state: GhostFillState = {
    active: true,
    selecting: false,
    selectedBlock: null,
    fields: [],
    overlay: host,
    shadowRoot: shadow,
  };

  // ── Toolbar ──
  const bar = document.createElement("div");
  bar.className = "gf-bar";
  shadow.appendChild(bar);

  function makeBtn(icon: string, tooltip: string): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = "gf-bar-btn";
    btn.innerHTML = icon;
    btn.setAttribute("data-tooltip", tooltip);
    return btn;
  }

  const btnSelect = makeBtn(ICONS.select, "Select block");
  const btnEye = makeBtn(ICONS.eye, "View fields");
  const btnFill = makeBtn(ICONS.fill, "Fill fields");
  const btnSettings = makeBtn(ICONS.settings, "Settings");
  const btnClose = makeBtn(ICONS.close, "Close");

  btnEye.disabled = true;
  btnFill.disabled = true;

  // Badge for field count
  const badge = document.createElement("span");
  badge.className = "gf-badge";
  badge.style.display = "none";
  btnSelect.style.position = "relative";
  btnSelect.appendChild(badge);

  // Warning dot for missing API key
  const dotWarn = document.createElement("span");
  dotWarn.className = "gf-dot-warn";
  dotWarn.title = "API key not set";
  btnSettings.style.position = "relative";
  btnSettings.appendChild(dotWarn);
  if (saved.apiKey) dotWarn.style.display = "none";

  const divider1 = document.createElement("span");
  divider1.className = "gf-divider";
  const divider2 = document.createElement("span");
  divider2.className = "gf-divider";

  bar.append(btnSelect, btnEye, btnFill, divider1, btnSettings, divider2, btnClose);

  // ── Toast ──
  const toast = document.createElement("div");
  toast.className = "gf-toast info";
  shadow.appendChild(toast);

  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  function showToast(text: string, type: "info" | "success" | "error" | "selecting", duration = 3000) {
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = text;
    toast.className = `gf-toast ${type} show`;
    if (duration > 0) {
      toastTimer = setTimeout(() => {
        toast.classList.remove("show");
      }, duration);
    }
  }
  function hideToast() {
    if (toastTimer) clearTimeout(toastTimer);
    toast.classList.remove("show");
  }

  // ── Settings Popover ──
  const settingsPop = document.createElement("div");
  settingsPop.className = "gf-popover";
  settingsPop.innerHTML = `
    <div class="gf-pop-header">
      <h3>/ghostfill</h3>
      <span class="gf-version">v0.1.0</span>
    </div>
    <div class="gf-pop-body">
      <div class="gf-field">
        <label class="gf-label">API Key</label>
        <input type="password" class="gf-input gf-input-mono" id="gf-s-key" placeholder="sk-..." autocomplete="off" spellcheck="false" />
      </div>
      <div class="gf-field">
        <label class="gf-label">Model</label>
        <select class="gf-input" id="gf-s-model">
          <option value="gpt-4o-mini">gpt-4o-mini</option>
          <option value="gpt-4o">gpt-4o</option>
          <option value="gpt-4.1-mini">gpt-4.1-mini</option>
          <option value="gpt-4.1-nano">gpt-4.1-nano</option>
          <option value="gpt-4.1">gpt-4.1</option>
        </select>
      </div>
      <div class="gf-field">
        <label class="gf-label">Base URL <span style="color:#52525b">(optional)</span></label>
        <input type="text" class="gf-input gf-input-mono" id="gf-s-url" placeholder="https://api.openai.com/v1" autocomplete="off" />
      </div>
      <button class="gf-save-btn" id="gf-s-save">Save</button>
      <span class="gf-saved" id="gf-s-saved">${ICONS.check} Saved</span>
    </div>
  `;
  shadow.appendChild(settingsPop);

  const sKeyInput = settingsPop.querySelector<HTMLInputElement>("#gf-s-key")!;
  const sModelSelect = settingsPop.querySelector<HTMLSelectElement>("#gf-s-model")!;
  const sUrlInput = settingsPop.querySelector<HTMLInputElement>("#gf-s-url")!;
  const sSaveBtn = settingsPop.querySelector<HTMLButtonElement>("#gf-s-save")!;
  const sSavedEl = settingsPop.querySelector<HTMLSpanElement>("#gf-s-saved")!;

  // Populate settings
  sKeyInput.value = saved.apiKey;
  sModelSelect.value = saved.model || "gpt-4o-mini";
  sUrlInput.value = saved.baseURL || "";

  // ── Prompt Popover ──
  const promptPop = document.createElement("div");
  promptPop.className = "gf-popover";
  promptPop.innerHTML = `
    <div class="gf-pop-header">
      <h3>Fill Fields</h3>
      <span class="gf-field-count" id="gf-p-count">0 fields</span>
    </div>
    <div class="gf-pop-body">
      <div id="gf-p-fields-wrap" style="display:none">
        <ul class="gf-field-list" id="gf-p-list"></ul>
      </div>
      <div class="gf-field">
        <textarea class="gf-input" id="gf-p-prompt" placeholder="Describe the data, e.g.&#10;'A US-based engineer named Sarah with gmail'" rows="3"></textarea>
      </div>
      <button class="gf-fill-btn" id="gf-p-fill">
        ${ICONS.fill} Fill with AI
      </button>
    </div>
  `;
  shadow.appendChild(promptPop);

  const pCountEl = promptPop.querySelector<HTMLSpanElement>("#gf-p-count")!;
  const pFieldsWrap = promptPop.querySelector<HTMLDivElement>("#gf-p-fields-wrap")!;
  const pFieldList = promptPop.querySelector<HTMLUListElement>("#gf-p-list")!;
  const pPromptEl = promptPop.querySelector<HTMLTextAreaElement>("#gf-p-prompt")!;
  const pFillBtn = promptPop.querySelector<HTMLButtonElement>("#gf-p-fill")!;

  // ── Popover management ──
  type PopoverName = "settings" | "prompt" | null;
  let currentPopover: PopoverName = null;

  function openPopover(name: PopoverName) {
    settingsPop.classList.remove("open");
    promptPop.classList.remove("open");
    btnSettings.classList.remove("active");
    btnEye.classList.remove("active");
    btnFill.classList.remove("active");

    if (name === currentPopover || name === null) {
      currentPopover = null;
      return;
    }

    currentPopover = name;
    if (name === "settings") {
      settingsPop.classList.add("open");
      btnSettings.classList.add("active");
      sKeyInput.focus();
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
    Object.assign(blockHighlight.style, {
      position: "fixed",
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      border: "2px solid #6366f1",
      borderRadius: "6px",
      backgroundColor: "rgba(99, 102, 241, 0.05)",
      pointerEvents: "none",
      zIndex: "2147483644",
      transition: "all 0.2s",
    });
    document.body.appendChild(blockHighlight);
  }

  function removeBlockHighlight() {
    blockHighlight?.remove();
    blockHighlight = null;
  }

  function showFieldsInPrompt(fields: DetectedField[]) {
    pCountEl.textContent = `${fields.length} field${fields.length === 1 ? "" : "s"}`;
    pFieldList.innerHTML = "";
    fields.forEach((f, i) => {
      const li = document.createElement("li");
      li.textContent = `${i + 1}. ${f.label} (${f.type})${f.required ? " *" : ""}`;
      pFieldList.appendChild(li);
    });
    pFieldsWrap.style.display = "block";
  }

  let cleanupSelector: (() => void) | null = null;

  // ── Button: Select Block ──
  btnSelect.addEventListener("click", () => {
    if (state.selecting) {
      cleanupSelector?.();
      cleanupSelector = null;
      state.selecting = false;
      btnSelect.classList.remove("active");
      showToast("Selection cancelled", "info");
      return;
    }

    openPopover(null); // close any popover
    state.selecting = true;
    btnSelect.classList.add("active");
    showToast("Click on a form area to select it (Esc to cancel)", "selecting", 0);

    cleanupSelector = startSelection(
      (element) => {
        state.selecting = false;
        state.selectedBlock = element;
        btnSelect.classList.remove("active");
        cleanupSelector = null;

        const fields = detectFields(element);
        state.fields = fields;

        if (fields.length === 0) {
          showToast("No fillable fields found — try a larger area", "error");
          badge.style.display = "none";
          btnEye.disabled = true;
          btnFill.disabled = true;
          return;
        }

        highlightBlock(element);
        showFieldsInPrompt(fields);
        badge.textContent = String(fields.length);
        badge.style.display = "flex";
        btnEye.disabled = false;
        btnFill.disabled = false;
        showToast(`${fields.length} fields detected`, "success");
      },
      () => {
        state.selecting = false;
        btnSelect.classList.remove("active");
        cleanupSelector = null;
        hideToast();
      },
      host
    );
  });

  // ── Button: Eye (view fields) ──
  btnEye.addEventListener("click", () => {
    if (state.fields.length === 0) return;
    openPopover("prompt");
  });

  // ── Button: Fill (open prompt) ──
  btnFill.addEventListener("click", () => {
    if (state.fields.length === 0) {
      showToast("Select a block first", "info");
      return;
    }
    openPopover("prompt");
  });

  // ── Button: Settings ──
  btnSettings.addEventListener("click", () => {
    openPopover("settings");
  });

  // ── Button: Close ──
  btnClose.addEventListener("click", () => {
    bar.style.display = "none";
    openPopover(null);
    hideToast();
    removeBlockHighlight();
    cleanupSelector?.();
    state.active = false;
  });

  // ── Settings: Save ──
  sSaveBtn.addEventListener("click", () => {
    const s: GhostFillSettings = {
      apiKey: sKeyInput.value.trim(),
      model: sModelSelect.value,
      baseURL: sUrlInput.value.trim(),
    };
    saveSettings(s);
    dotWarn.style.display = s.apiKey ? "none" : "block";
    sSavedEl.classList.add("show");
    setTimeout(() => sSavedEl.classList.remove("show"), 2000);
  });

  // ── Prompt: Fill ──
  async function doFill() {
    const promptText = pPromptEl.value.trim();
    if (!promptText) {
      showToast("Enter a prompt first", "error");
      pPromptEl.focus();
      return;
    }

    const settings = loadSettings();
    if (!settings.apiKey) {
      showToast("Set your API key in Settings first", "error");
      openPopover("settings");
      return;
    }

    if (state.fields.length === 0) {
      showToast("No fields selected", "error");
      return;
    }

    pFillBtn.disabled = true;
    pFillBtn.innerHTML = `<span class="gf-spin">${ICONS.spinner}</span> Generating...`;
    showToast("Calling AI...", "info", 0);

    try {
      const fillData = await generateFillData(state.fields, promptText, {
        apiKey: settings.apiKey,
        model: settings.model,
        baseURL: settings.baseURL || undefined,
        systemPrompt: options.systemPrompt,
      });
      const { filled, errors } = fillFields(state.fields, fillData);

      if (errors.length > 0) {
        showToast(`Filled ${filled}/${state.fields.length} (${errors.length} error${errors.length > 1 ? "s" : ""})`, filled > 0 ? "success" : "error");
      } else {
        showToast(`Filled ${filled} field${filled === 1 ? "" : "s"}!`, "success");
        openPopover(null);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error", 5000);
    } finally {
      pFillBtn.disabled = false;
      pFillBtn.innerHTML = `${ICONS.fill} Fill with AI`;
    }
  }

  pFillBtn.addEventListener("click", doFill);

  pPromptEl.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      doFill();
    }
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
        bar.style.display = "none";
        openPopover(null);
        hideToast();
        removeBlockHighlight();
        state.active = false;
      } else {
        bar.style.display = "flex";
        state.active = true;
      }
    }
  }
  document.addEventListener("keydown", handleShortcut);

  // ── Destroy ──
  function destroy() {
    cleanupSelector?.();
    removeBlockHighlight();
    document.removeEventListener("keydown", handleShortcut);
    host.remove();
  }

  return { state, destroy };
}
