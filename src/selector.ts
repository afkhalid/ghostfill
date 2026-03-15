/** Block selection mode — user hovers over elements and clicks to select a container */

type SelectCallback = (element: HTMLElement) => void;
type CancelCallback = () => void;

let currentHighlight: HTMLElement | null = null;
let overlay: HTMLDivElement | null = null;

function createOverlay(color: string): HTMLDivElement {
  const div = document.createElement("div");
  div.id = "ghostfill-selector-overlay";
  // Convert hex to rgba for background
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  Object.assign(div.style, {
    position: "fixed",
    pointerEvents: "none",
    border: `2px dashed ${color}`,
    borderRadius: "4px",
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.08)`,
    zIndex: "2147483645",
    transition: "all 0.15s ease",
  });
  document.body.appendChild(div);
  return div;
}

function positionOverlay(el: HTMLElement, color: string) {
  if (!overlay) overlay = createOverlay(color);
  const rect = el.getBoundingClientRect();
  Object.assign(overlay.style, {
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    display: "block",
  });
}

function hideOverlay() {
  if (overlay) overlay.style.display = "none";
}

function removeOverlay() {
  overlay?.remove();
  overlay = null;
}

/** Find the best container element (prefer forms, fieldsets, or sizeable containers) */
function findBestContainer(target: HTMLElement): HTMLElement {
  if (target.tagName === "FORM" || target.tagName === "FIELDSET") return target;

  let el: HTMLElement | null = target;
  while (el) {
    if (el.tagName === "FORM" || el.tagName === "FIELDSET") return el;

    const inputs = el.querySelectorAll(
      "input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select"
    );
    if (inputs.length >= 2) return el;

    el = el.parentElement;
  }

  return target;
}

/** Start block selection mode */
export function startSelection(
  onSelect: SelectCallback,
  onCancel: CancelCallback,
  ghostfillRoot?: HTMLElement,
  highlightColor = "#6366f1"
): () => void {
  document.body.style.cursor = "crosshair";

  function handleMouseMove(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (ghostfillRoot?.contains(target)) return;
    if (target.id === "ghostfill-selector-overlay") return;

    const container = findBestContainer(target);
    if (container !== currentHighlight) {
      currentHighlight = container;
      positionOverlay(container, highlightColor);
    }
  }

  function handleClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (ghostfillRoot?.contains(target)) return;

    e.preventDefault();
    e.stopPropagation();
    cleanup();

    const container = findBestContainer(target);
    onSelect(container);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      cleanup();
      onCancel();
    }
  }

  function cleanup() {
    document.body.style.cursor = "";
    document.removeEventListener("mousemove", handleMouseMove, true);
    document.removeEventListener("click", handleClick, true);
    document.removeEventListener("keydown", handleKeyDown, true);
    hideOverlay();
    removeOverlay();
    currentHighlight = null;
  }

  document.addEventListener("mousemove", handleMouseMove, true);
  document.addEventListener("click", handleClick, true);
  document.addEventListener("keydown", handleKeyDown, true);

  return cleanup;
}
