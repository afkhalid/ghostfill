import type { DetectedField, FieldFillData } from "./types";

/**
 * Set value on an input/textarea/select and dispatch events that React,
 * Vue, and Angular controlled components will pick up.
 */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  // For React: we must use the native setter so React's internal tracking
  // sees it as a new value and fires onChange handlers.
  const proto =
    el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;

  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }

  // Dispatch events in the order React/browsers expect
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Focus then blur to trigger validation */
function focusBlur(el: HTMLElement) {
  el.focus();
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

/** Click a custom dropdown button, wait for listbox, click the matching option */
async function fillCustomSelect(button: HTMLElement, value: string): Promise<void> {
  // Click the button to open the dropdown
  button.click();

  // Wait for the listbox to appear (Headless UI renders it after a tick)
  await new Promise((r) => setTimeout(r, 200));

  // Find the listbox — could be a sibling, or anywhere in the document
  const listboxId = button.getAttribute("aria-controls");
  let listbox: Element | null = listboxId ? document.getElementById(listboxId) : null;
  if (!listbox) {
    listbox = button.parentElement?.querySelector("[role=listbox]") || document.querySelector("[role=listbox]");
  }

  if (listbox) {
    const options = listbox.querySelectorAll("[role=option]");

    // Try exact match
    for (const opt of options) {
      const text = opt.textContent?.trim();
      if (text === value || text?.toLowerCase() === value.toLowerCase()) {
        (opt as HTMLElement).click();
        await new Promise((r) => setTimeout(r, 50));
        return;
      }
    }

    // Try partial match
    for (const opt of options) {
      const text = opt.textContent?.trim()?.toLowerCase() || "";
      if (text.includes(value.toLowerCase()) || value.toLowerCase().includes(text)) {
        (opt as HTMLElement).click();
        await new Promise((r) => setTimeout(r, 50));
        return;
      }
    }

    // No match — pick the first real option (skip placeholders)
    for (const opt of options) {
      const text = (opt.textContent?.trim() || "").toLowerCase();
      const isPlaceholder = text.startsWith("select") || text === "" || text === "---" || text === "choose" || text.startsWith("choose");
      if (!isPlaceholder) {
        (opt as HTMLElement).click();
        await new Promise((r) => setTimeout(r, 50));
        return;
      }
    }
    // If all look like placeholders, just pick the last one
    if (options.length > 1) {
      (options[options.length - 1] as HTMLElement).click();
      await new Promise((r) => setTimeout(r, 50));
      return;
    }
  }

  // Close dropdown if nothing worked
  button.click();
}

/** Fill detected fields with AI-generated data */
export async function fillFields(
  fields: DetectedField[],
  fillData: FieldFillData[]
): Promise<{ filled: number; errors: string[] }> {
  let filled = 0;
  const errors: string[] = [];

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
          // For React checkboxes, we need to use Object.getOwnPropertyDescriptor
          const nativeCheckedSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype, "checked"
          )?.set;
          if (nativeCheckedSetter) {
            nativeCheckedSetter.call(checkbox, shouldCheck);
          } else {
            checkbox.checked = shouldCheck;
          }
          checkbox.dispatchEvent(new Event("click", { bubbles: true }));
          checkbox.dispatchEvent(new Event("input", { bubbles: true }));
          checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        }
        filled++;
      } else if (field.type === "radio") {
        const radio = el as HTMLInputElement;
        if (radio.name && filledRadioGroups.has(radio.name)) continue;

        if (radio.name) {
          const group = document.querySelectorAll<HTMLInputElement>(
            `input[type="radio"][name="${CSS.escape(radio.name)}"]`
          );
          for (const r of group) {
            if (r.value === item.value || findLabel(r) === item.value) {
              const nativeCheckedSetter = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype, "checked"
              )?.set;
              if (nativeCheckedSetter) {
                nativeCheckedSetter.call(r, true);
              } else {
                r.checked = true;
              }
              r.dispatchEvent(new Event("click", { bubbles: true }));
              r.dispatchEvent(new Event("input", { bubbles: true }));
              r.dispatchEvent(new Event("change", { bubbles: true }));
              break;
            }
          }
          filledRadioGroups.add(radio.name);
        } else {
          radio.checked = true;
          radio.dispatchEvent(new Event("click", { bubbles: true }));
          radio.dispatchEvent(new Event("change", { bubbles: true }));
        }
        filled++;
      } else if (field.type === "select") {
        if (el instanceof HTMLSelectElement) {
          // Native <select>
          const pickFirst = () => {
            const real = Array.from(el.options).find((o) => {
              if (!o.value || o.disabled) return false;
              const t = (o.textContent?.trim() || "").toLowerCase();
              return !t.startsWith("select") && t !== "" && !t.startsWith("choose") && t !== "---";
            });
            if (real) setNativeValue(el, real.value);
          };
          if (item.value === "__FIRST__") {
            pickFirst();
          } else {
            const option = Array.from(el.options).find(
              (opt) =>
                opt.textContent?.trim() === item.value || opt.value === item.value
            );
            if (option) {
              setNativeValue(el, option.value);
            } else {
              pickFirst();
            }
          }
          focusBlur(el);
        } else {
          // Custom dropdown (Headless UI Listbox, Radix, etc.)
          await fillCustomSelect(el, item.value);
        }
        filled++;
      } else {
        // text, email, number, date, datetime-local, tel, url, textarea
        setNativeValue(el, item.value);
        focusBlur(el);
        filled++;
      }

      // Brief subtle flash to show which fields were filled
      const origBg = el.style.backgroundColor;
      el.style.transition = "background-color 0.3s";
      el.style.backgroundColor = "rgba(99, 102, 241, 0.12)";
      setTimeout(() => {
        el.style.backgroundColor = origBg;
      }, 800);
    } catch (err) {
      errors.push(
        `Failed to fill "${field.label}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { filled, errors };
}

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
