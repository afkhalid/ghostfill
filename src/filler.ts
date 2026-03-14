import type { DetectedField, FieldFillData } from "./types";

/** Dispatch native input events so frameworks (React, Vue, Angular) pick up the change */
function triggerInputEvents(el: HTMLElement) {
  // React tracks values via internal fiber — we need to set the native value setter
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;

  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (nativeSetter) {
    nativeSetter.call(el, (el as HTMLInputElement).value);
  }

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

/** Fill detected fields with AI-generated data */
export function fillFields(
  fields: DetectedField[],
  fillData: FieldFillData[]
): { filled: number; errors: string[] } {
  let filled = 0;
  const errors: string[] = [];

  // Group radio buttons by name to avoid filling multiple in same group
  const filledRadioGroups = new Set<string>();

  for (const item of fillData) {
    const field = fields[item.index];
    if (!field) {
      errors.push(`Field index ${item.index} out of range`);
      continue;
    }

    const el = field.element;

    try {
      if (field.type === "checkbox") {
        const checkbox = el as HTMLInputElement;
        const shouldCheck = item.checked ?? item.value === "true";
        if (checkbox.checked !== shouldCheck) {
          checkbox.checked = shouldCheck;
          triggerInputEvents(checkbox);
        }
        filled++;
      } else if (field.type === "radio") {
        const radio = el as HTMLInputElement;
        if (radio.name && filledRadioGroups.has(radio.name)) continue;

        // Find the radio in the group matching the value
        if (radio.name) {
          const group = document.querySelectorAll<HTMLInputElement>(
            `input[type="radio"][name="${CSS.escape(radio.name)}"]`
          );
          for (const r of group) {
            if (
              r.value === item.value ||
              findLabel(r) === item.value
            ) {
              r.checked = true;
              triggerInputEvents(r);
              break;
            }
          }
          filledRadioGroups.add(radio.name);
        } else {
          radio.checked = true;
          triggerInputEvents(radio);
        }
        filled++;
      } else if (field.type === "select") {
        const select = el as HTMLSelectElement;
        // Find option by text or value
        const option = Array.from(select.options).find(
          (opt) =>
            opt.textContent?.trim() === item.value || opt.value === item.value
        );
        if (option) {
          select.value = option.value;
        } else {
          select.value = item.value;
        }
        triggerInputEvents(select);
        filled++;
      } else {
        // text, email, number, date, tel, url, textarea, etc.
        (el as HTMLInputElement).value = item.value;
        triggerInputEvents(el);
        filled++;
      }

      // Brief highlight animation
      el.style.transition = "outline 0.3s, outline-offset 0.3s";
      el.style.outline = "2px solid #22c55e";
      el.style.outlineOffset = "2px";
      setTimeout(() => {
        el.style.outline = "";
        el.style.outlineOffset = "";
      }, 1200);
    } catch (err) {
      errors.push(
        `Failed to fill "${field.label}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { filled, errors };
}

/** Find label text for a radio button */
function findLabel(el: HTMLElement): string {
  if (el.id) {
    const label = document.querySelector<HTMLLabelElement>(
      `label[for="${CSS.escape(el.id)}"]`
    );
    if (label?.textContent?.trim()) return label.textContent.trim();
  }
  const parent = el.closest("label");
  if (parent) {
    const clone = parent.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input").forEach((c) => c.remove());
    return clone.textContent?.trim() || "";
  }
  return "";
}
