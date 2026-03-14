import type { DetectedField } from "./types";

const INPUT_SELECTORS = [
  "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image])",
  "textarea",
  "select",
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

  // 7. name attribute as fallback
  const name = el.getAttribute("name");
  if (name) return name.replace(/[_\-[\]]/g, " ").trim();

  return "unknown";
}

/** Detect all fillable fields within a container element */
export function detectFields(container: HTMLElement): DetectedField[] {
  const elements = container.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >(INPUT_SELECTORS);

  const fields: DetectedField[] = [];

  elements.forEach((el) => {
    // Skip disabled and readonly fields
    if (el.disabled || el.readOnly) return;
    // Skip hidden elements
    if (el.offsetParent === null && el.type !== "hidden") return;

    const field: DetectedField = {
      element: el,
      type: el instanceof HTMLSelectElement ? "select" : (el as HTMLInputElement).type || "text",
      name: el.name || el.id || "",
      label: findLabel(el),
      required: el.required || el.getAttribute("aria-required") === "true",
      currentValue: el.value,
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
export function describeFields(fields: DetectedField[]): string {
  return fields
    .map((f, i) => {
      let desc = `[${i}] "${f.label}" (type: ${f.type}`;
      if (f.required) desc += ", required";
      if (f.options?.length) desc += `, options: [${f.options.join(", ")}]`;
      if (f.min) desc += `, min: ${f.min}`;
      if (f.max) desc += `, max: ${f.max}`;
      if (f.pattern) desc += `, pattern: ${f.pattern}`;
      if (f.currentValue) desc += `, current: "${f.currentValue}"`;
      desc += ")";
      return desc;
    })
    .join("\n");
}
