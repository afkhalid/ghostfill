import type { GhostFillOptions, GhostFillState, DetectedField } from "./types";
import { detectFields } from "./detector";
import { generateFillData } from "./ai";
import { fillFields } from "./filler";
import { startSelection } from "./selector";

const POSITIONS = {
  "bottom-right": { bottom: "20px", right: "20px" },
  "bottom-left": { bottom: "20px", left: "20px" },
  "top-right": { top: "20px", right: "20px" },
  "top-left": { top: "20px", left: "20px" },
} as const;

const CSS = `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    color: #1f2937;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .gf-trigger {
    position: fixed;
    z-index: 2147483646;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    border: none;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .gf-trigger:hover {
    transform: scale(1.08);
    box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
  }
  .gf-trigger.active {
    background: linear-gradient(135deg, #ef4444, #f97316);
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
  }
  .gf-trigger svg {
    width: 22px;
    height: 22px;
  }

  .gf-panel {
    position: fixed;
    z-index: 2147483646;
    width: 360px;
    max-height: 480px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05);
    overflow: hidden;
    display: none;
    flex-direction: column;
  }
  .gf-panel.open { display: flex; }

  .gf-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
  }
  .gf-header h3 {
    font-size: 14px;
    font-weight: 600;
    color: #111827;
  }
  .gf-close {
    background: none;
    border: none;
    cursor: pointer;
    color: #6b7280;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
  }
  .gf-close:hover { background: #f3f4f6; color: #111827; }

  .gf-body {
    padding: 16px;
    overflow-y: auto;
    flex: 1;
  }

  .gf-status {
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 13px;
    margin-bottom: 12px;
  }
  .gf-status.info { background: #eff6ff; color: #1d4ed8; }
  .gf-status.success { background: #f0fdf4; color: #15803d; }
  .gf-status.error { background: #fef2f2; color: #b91c1c; }
  .gf-status.selecting { background: #faf5ff; color: #7c3aed; }

  .gf-fields {
    margin-bottom: 12px;
  }
  .gf-fields summary {
    cursor: pointer;
    font-size: 12px;
    color: #6b7280;
    padding: 4px 0;
    user-select: none;
  }
  .gf-field-list {
    list-style: none;
    padding: 8px 0 0 0;
    max-height: 120px;
    overflow-y: auto;
  }
  .gf-field-list li {
    font-size: 12px;
    color: #4b5563;
    padding: 3px 8px;
    border-radius: 4px;
  }
  .gf-field-list li:nth-child(odd) { background: #f9fafb; }

  .gf-prompt-area {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .gf-prompt {
    width: 100%;
    min-height: 64px;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-family: inherit;
    font-size: 13px;
    resize: vertical;
    outline: none;
    transition: border-color 0.2s;
  }
  .gf-prompt:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
  .gf-prompt::placeholder { color: #9ca3af; }

  .gf-actions {
    display: flex;
    gap: 8px;
  }
  .gf-btn {
    flex: 1;
    padding: 8px 16px;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }
  .gf-btn-primary {
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: white;
  }
  .gf-btn-primary:hover { background: linear-gradient(135deg, #4f46e5, #7c3aed); }
  .gf-btn-primary:disabled {
    background: #d1d5db;
    cursor: not-allowed;
  }
  .gf-btn-secondary {
    background: #f3f4f6;
    color: #374151;
  }
  .gf-btn-secondary:hover { background: #e5e7eb; }

  .gf-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: gf-spin 0.6s linear infinite;
    margin-right: 6px;
    vertical-align: middle;
  }
  @keyframes gf-spin { to { transform: rotate(360deg); } }
`;

const GHOST_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 2C7.58 2 4 5.58 4 10v10l2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2V10c0-4.42-3.58-8-8-8z"/>
  <circle cx="9" cy="10" r="1.5" fill="currentColor"/>
  <circle cx="15" cy="10" r="1.5" fill="currentColor"/>
</svg>`;

export function createOverlay(options: GhostFillOptions): {
  state: GhostFillState;
  destroy: () => void;
} {
  const pos = options.position || "bottom-right";

  // Create shadow host
  const host = document.createElement("div");
  host.id = "ghostfill-root";
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "closed" });

  // Inject styles
  const style = document.createElement("style");
  style.textContent = CSS;
  shadow.appendChild(style);

  // State
  const state: GhostFillState = {
    active: false,
    selecting: false,
    selectedBlock: null,
    fields: [],
    overlay: host,
    shadowRoot: shadow,
  };

  // -- Trigger button --
  const trigger = document.createElement("button");
  trigger.className = "gf-trigger";
  trigger.innerHTML = GHOST_ICON;
  trigger.title = "GhostFill — AI Form Filler";
  Object.assign(trigger.style, POSITIONS[pos]);
  shadow.appendChild(trigger);

  // -- Panel --
  const panel = document.createElement("div");
  panel.className = "gf-panel";

  // Position panel near trigger
  const panelPos = { ...POSITIONS[pos] } as Record<string, string>;
  if (panelPos.bottom) panelPos.bottom = `${parseInt(panelPos.bottom) + 56}px`;
  if (panelPos.top) panelPos.top = `${parseInt(panelPos.top) + 56}px`;
  Object.assign(panel.style, panelPos);
  shadow.appendChild(panel);

  // Panel HTML
  panel.innerHTML = `
    <div class="gf-header">
      <h3>GhostFill</h3>
      <button class="gf-close" aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="gf-body">
      <div class="gf-status info" id="gf-status">Click "Select Block" to choose a form area</div>
      <div class="gf-fields" id="gf-fields" style="display:none">
        <details>
          <summary><span id="gf-field-count">0</span> fields detected</summary>
          <ul class="gf-field-list" id="gf-field-list"></ul>
        </details>
      </div>
      <div class="gf-prompt-area">
        <textarea class="gf-prompt" id="gf-prompt" placeholder="Describe the data you want, e.g.:\n'A US-based software engineer named John, with a gmail address'" disabled></textarea>
        <div class="gf-actions">
          <button class="gf-btn gf-btn-secondary" id="gf-select">Select Block</button>
          <button class="gf-btn gf-btn-primary" id="gf-fill" disabled>Fill Fields</button>
        </div>
      </div>
    </div>
  `;

  // References
  const statusEl = panel.querySelector<HTMLDivElement>("#gf-status")!;
  const fieldsSection = panel.querySelector<HTMLDivElement>("#gf-fields")!;
  const fieldCount = panel.querySelector<HTMLSpanElement>("#gf-field-count")!;
  const fieldList = panel.querySelector<HTMLUListElement>("#gf-field-list")!;
  const promptEl = panel.querySelector<HTMLTextAreaElement>("#gf-prompt")!;
  const selectBtn = panel.querySelector<HTMLButtonElement>("#gf-select")!;
  const fillBtn = panel.querySelector<HTMLButtonElement>("#gf-fill")!;
  const closeBtn = panel.querySelector<HTMLButtonElement>(".gf-close")!;

  // Block highlight (drawn on the page, not in shadow)
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
      border: "2px solid #22c55e",
      borderRadius: "4px",
      backgroundColor: "rgba(34, 197, 94, 0.06)",
      pointerEvents: "none",
      zIndex: "2147483644",
    });
    document.body.appendChild(blockHighlight);
  }

  function removeBlockHighlight() {
    blockHighlight?.remove();
    blockHighlight = null;
  }

  function setStatus(text: string, type: "info" | "success" | "error" | "selecting") {
    statusEl.textContent = text;
    statusEl.className = `gf-status ${type}`;
  }

  function showFields(fields: DetectedField[]) {
    fieldCount.textContent = String(fields.length);
    fieldList.innerHTML = "";
    fields.forEach((f, i) => {
      const li = document.createElement("li");
      li.textContent = `${i + 1}. ${f.label} (${f.type})${f.required ? " *" : ""}`;
      fieldList.appendChild(li);
    });
    fieldsSection.style.display = "block";
  }

  let cleanupSelector: (() => void) | null = null;

  // -- Toggle panel --
  trigger.addEventListener("click", () => {
    state.active = !state.active;
    panel.classList.toggle("open", state.active);
    trigger.classList.toggle("active", state.active);
    if (!state.active) {
      // Reset
      cleanupSelector?.();
      cleanupSelector = null;
      state.selecting = false;
      state.selectedBlock = null;
      state.fields = [];
      removeBlockHighlight();
      fieldsSection.style.display = "none";
      promptEl.disabled = true;
      fillBtn.disabled = true;
      setStatus('Click "Select Block" to choose a form area', "info");
    }
  });

  // -- Close button --
  closeBtn.addEventListener("click", () => {
    state.active = false;
    panel.classList.remove("open");
    trigger.classList.remove("active");
    cleanupSelector?.();
    removeBlockHighlight();
  });

  // -- Select block --
  selectBtn.addEventListener("click", () => {
    if (state.selecting) {
      cleanupSelector?.();
      cleanupSelector = null;
      state.selecting = false;
      selectBtn.textContent = "Select Block";
      setStatus('Click "Select Block" to choose a form area', "info");
      return;
    }

    state.selecting = true;
    selectBtn.textContent = "Cancel";
    setStatus("Hover over a form area and click to select", "selecting");
    removeBlockHighlight();
    fieldsSection.style.display = "none";
    promptEl.disabled = true;
    fillBtn.disabled = true;

    cleanupSelector = startSelection(
      (element) => {
        // Selected!
        state.selecting = false;
        state.selectedBlock = element;
        selectBtn.textContent = "Re-select";
        cleanupSelector = null;

        const fields = detectFields(element);
        state.fields = fields;

        if (fields.length === 0) {
          setStatus("No fillable fields found in this block. Try a larger area.", "error");
          return;
        }

        highlightBlock(element);
        showFields(fields);
        setStatus(`${fields.length} fields detected — enter a prompt and click Fill`, "success");
        promptEl.disabled = false;
        fillBtn.disabled = false;
        promptEl.focus();
      },
      () => {
        // Cancelled
        state.selecting = false;
        selectBtn.textContent = "Select Block";
        cleanupSelector = null;
        setStatus('Selection cancelled. Click "Select Block" to try again.', "info");
      },
      host
    );
  });

  // -- Fill fields --
  fillBtn.addEventListener("click", async () => {
    const prompt = promptEl.value.trim();
    if (!prompt) {
      setStatus("Please enter a prompt describing the data you want.", "error");
      promptEl.focus();
      return;
    }

    if (state.fields.length === 0) {
      setStatus("No fields detected. Select a block first.", "error");
      return;
    }

    fillBtn.disabled = true;
    selectBtn.disabled = true;
    promptEl.disabled = true;
    fillBtn.innerHTML = '<span class="gf-spinner"></span>Generating...';
    setStatus("Calling AI to generate data...", "info");

    try {
      const fillData = await generateFillData(state.fields, prompt, options);
      const { filled, errors } = fillFields(state.fields, fillData);

      if (errors.length > 0) {
        setStatus(
          `Filled ${filled}/${state.fields.length} fields. ${errors.length} error(s): ${errors[0]}`,
          filled > 0 ? "success" : "error"
        );
      } else {
        setStatus(`Successfully filled ${filled} field(s)!`, "success");
      }
    } catch (err) {
      setStatus(
        `Error: ${err instanceof Error ? err.message : String(err)}`,
        "error"
      );
    } finally {
      fillBtn.disabled = false;
      selectBtn.disabled = false;
      promptEl.disabled = false;
      fillBtn.textContent = "Fill Fields";
    }
  });

  // -- Submit on Ctrl+Enter --
  promptEl.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      fillBtn.click();
    }
  });

  // -- Keyboard shortcut --
  const shortcut = options.shortcut || "Alt+G";
  const keys = shortcut.toLowerCase().split("+");
  function handleShortcut(e: KeyboardEvent) {
    const match =
      (keys.includes("alt") ? e.altKey : !e.altKey) &&
      (keys.includes("ctrl") || keys.includes("control")
        ? e.ctrlKey
        : !e.ctrlKey) &&
      (keys.includes("shift") ? e.shiftKey : !e.shiftKey) &&
      (keys.includes("meta") || keys.includes("cmd")
        ? e.metaKey
        : !e.metaKey) &&
      e.key.toLowerCase() ===
        keys.filter(
          (k) => !["alt", "ctrl", "control", "shift", "meta", "cmd"].includes(k)
        )[0];

    if (match) {
      e.preventDefault();
      trigger.click();
    }
  }
  document.addEventListener("keydown", handleShortcut);

  // Destroy function
  function destroy() {
    cleanupSelector?.();
    removeBlockHighlight();
    document.removeEventListener("keydown", handleShortcut);
    host.remove();
  }

  return { state, destroy };
}
