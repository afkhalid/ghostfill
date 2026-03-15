import type { DetectedField, GhostFillPromptField } from "./types";

const INPUT_SELECTORS = [
  "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image])",
  "textarea",
  "select",
  // Custom dropdown triggers (Headless UI Listbox, Radix, etc.)
  "button[role=combobox]",
  "[role=combobox]:not(input)",
  "button[aria-haspopup=listbox]",
].join(", ");

/** Find the label text for a form field */
function findLabel(el: HTMLElement): string {
  // 1. Explicit <label for="id">
  if (el.id) {
    const label = document.querySelector<HTMLLabelElement>(
      `label[for="${CSS.escape(el.id)}"]`
    );
    if (label?.textContent?.trim()) return label.textContent.trim();
  }

  // 2. Wrapping <label>
  const parentLabel = el.closest("label");
  if (parentLabel) {
    // Get text content excluding the input itself
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input, textarea, select").forEach((c) => c.remove());
    const text = clone.textContent?.trim();
    if (text) return text;
  }

  // 3. aria-label
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel?.trim()) return ariaLabel.trim();

  // 4. aria-labelledby
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean);
    if (parts.length) return parts.join(" ");
  }

  // 5. placeholder
  if ("placeholder" in el) {
    const ph = (el as HTMLInputElement).placeholder;
    if (ph?.trim()) return ph.trim();
  }

  // 6. title
  const title = el.getAttribute("title");
  if (title?.trim()) return title.trim();

  // 7. Preceding sibling text (common pattern: <span>Label</span><input>)
  const prev = el.previousElementSibling;
  if (prev && !["INPUT", "TEXTAREA", "SELECT"].includes(prev.tagName)) {
    const prevText = prev.textContent?.trim();
    if (prevText && prevText.length < 60) return prevText;
  }

  // 8. Parent's first text node or heading
  const parent = el.parentElement;
  if (parent) {
    // Look for a heading or label-like element before this input in the parent
    for (const child of Array.from(parent.children)) {
      if (child === el) break;
      if (["LABEL", "SPAN", "P", "H1", "H2", "H3", "H4", "H5", "H6", "LEGEND", "DIV"].includes(child.tagName)) {
        const text = child.textContent?.trim();
        if (text && text.length < 60 && !child.querySelector("input, textarea, select")) {
          return text;
        }
      }
    }
  }

  // 9. id attribute humanized
  if (el.id) return el.id.replace(/[_\-]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();

  // 10. name attribute as fallback
  const name = el.getAttribute("name");
  if (name) return name.replace(/[_\-[\]]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();

  return "unknown";
}

/** Detect all fillable fields within a container element */
export function detectFields(container: HTMLElement): DetectedField[] {
  const elements = container.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >(INPUT_SELECTORS);

  const fields: DetectedField[] = [];

  elements.forEach((el) => {
    // Skip disabled fields
    if ((el as HTMLInputElement).disabled) return;
    if ((el as HTMLInputElement).readOnly) return;
    // Skip hidden elements
    if (el.offsetParent === null && (el as HTMLInputElement).type !== "hidden") return;

    // Custom combobox / listbox (Headless UI, Radix, etc.)
    const isCustomDropdown =
      (el.getAttribute("role") === "combobox" && !(el instanceof HTMLInputElement)) ||
      el.getAttribute("aria-haspopup") === "listbox";
    if (isCustomDropdown) {
      // Find listbox options: aria-controls, sibling [role=listbox], or Headless UI pattern
      const listboxId = el.getAttribute("aria-controls");
      let listbox: Element | null = listboxId ? document.getElementById(listboxId) : null;
      if (!listbox) {
        // Headless UI puts the listbox as a sibling inside the same relative container
        listbox = el.parentElement?.querySelector("[role=listbox]") || null;
      }

      const options: string[] = [];
      if (listbox) {
        listbox.querySelectorAll("[role=option]").forEach((opt) => {
          const text = opt.textContent?.trim();
          if (text) options.push(text);
        });
      }

      // Get current display value from button text
      const buttonText = el.textContent?.trim() || "";
      // Check if it looks like a placeholder
      const looksLikePlaceholder = buttonText.toLowerCase().startsWith("select") || buttonText === "";

      const field: DetectedField = {
        element: el as any,
        type: "select",
        name: el.id || el.getAttribute("name") || "",
        label: findLabel(el),
        required: el.getAttribute("aria-required") === "true",
        currentValue: looksLikePlaceholder ? "" : buttonText,
        options: options.length > 0 ? options : undefined,
      };
      fields.push(field);
      return;
    }

    const field: DetectedField = {
      element: el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
      type: el instanceof HTMLSelectElement ? "select" : (el as HTMLInputElement).type || "text",
      name: (el as HTMLInputElement).name || el.id || "",
      label: findLabel(el),
      required: (el as HTMLInputElement).required || el.getAttribute("aria-required") === "true",
      currentValue: (el as HTMLInputElement).value,
    };

    // Collect select options
    if (el instanceof HTMLSelectElement) {
      field.options = Array.from(el.options)
        .filter((opt) => opt.value && !opt.disabled)
        .map((opt) => opt.textContent?.trim() || opt.value);
    }

    // Collect constraints
    if ("min" in el && (el as HTMLInputElement).min) {
      field.min = (el as HTMLInputElement).min;
    }
    if ("max" in el && (el as HTMLInputElement).max) {
      field.max = (el as HTMLInputElement).max;
    }
    if ("pattern" in el && (el as HTMLInputElement).pattern) {
      field.pattern = (el as HTMLInputElement).pattern;
    }

    fields.push(field);
  });

  return fields;
}

/** Build a description of fields for the AI prompt */
export function describeFields(
  fields: Array<
    Pick<
      DetectedField | GhostFillPromptField,
      "type" | "label" | "required" | "options" | "min" | "max" | "pattern"
    >
  >
): string {
  return fields
    .map((f, i) => {
      let desc = `[${i}] "${f.label}" (type: ${f.type}`;
      if (f.required) desc += ", required";
      if (f.options?.length) desc += `, options: [${f.options.join(", ")}]`;
      if (f.min) desc += `, min: ${f.min}`;
      if (f.max) desc += `, max: ${f.max}`;
      if (f.pattern) desc += `, pattern: ${f.pattern}`;
      desc += ")";
      return desc;
    })
    .join("\n");
}
