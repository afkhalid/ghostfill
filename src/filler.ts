import type { DetectedField, FieldFillData } from "./types";
import { findLabel } from "./detector";

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

  // Wait for dropdown to appear — poll up to 500ms for listbox or any new panel
  let waited = 0;
  const step = 50;
  while (waited < 500) {
    await new Promise((r) => setTimeout(r, step));
    waited += step;
    // Check for role=listbox
    const lb = button.getAttribute("aria-controls")
      ? document.getElementById(button.getAttribute("aria-controls")!)
      : button.parentElement?.querySelector("[role=listbox]") || document.querySelector("[role=listbox]");
    if (lb) break;
    // Check for a sibling panel that appeared (conditionally rendered dropdowns)
    const cont = button.closest("[class*='relative']") || button.parentElement;
    if (cont) {
      const divs = cont.querySelectorAll("div");
      for (const d of divs) {
        if (d === button || d.contains(button) || button.contains(d)) continue;
        if (d.classList.toString().includes("absolute") || d.classList.toString().includes("z-50")) {
          waited = 999; // found it, break out
          break;
        }
      }
    }
  }

  // Find the listbox — could be a sibling, portal to body, or anywhere
  const listboxId = button.getAttribute("aria-controls");
  let listbox: Element | null = listboxId ? document.getElementById(listboxId) : null;
  if (!listbox) {
    listbox = button.parentElement?.querySelector("[role=listbox]") || null;
  }
  if (!listbox) {
    // Check all listboxes in the document — pick the one that's visible
    const all = document.querySelectorAll("[role=listbox]");
    for (const lb of all) {
      if ((lb as HTMLElement).offsetParent !== null || (lb as HTMLElement).offsetHeight > 0) {
        listbox = lb;
        break;
      }
    }
  }

  // Collect clickable options — try [role=option] first, then fall back to buttons/divs in popup
  let options: NodeListOf<Element> | Element[] = listbox
    ? listbox.querySelectorAll("[role=option]")
    : [] as Element[];

  // If no role=option found, look for a popup panel near the button with clickable items
  if ((!listbox || options.length === 0)) {
    let panel: Element | null = null;

    // Strategy 1: Check direct children of the button's parent container
    const container = button.closest("[class*='relative']") || button.parentElement;
    if (container) {
      for (const child of Array.from(container.children)) {
        if (child === button || child.contains(button)) continue;
        if (child.tagName === "LABEL" || child.tagName === "P" || child.tagName === "SPAN") continue;
        const el = child as HTMLElement;
        const style = window.getComputedStyle(el);
        if (
          el.classList.contains("absolute") ||
          el.classList.contains("z-50") ||
          style.position === "absolute" ||
          style.position === "fixed"
        ) {
          panel = el;
          break;
        }
      }
    }

    // Strategy 2: Check siblings of the button directly
    if (!panel) {
      let sibling = button.nextElementSibling;
      while (sibling) {
        const tag = sibling.tagName;
        if (tag !== "P" && tag !== "LABEL" && tag !== "SPAN" && tag === "DIV") {
          panel = sibling;
          break;
        }
        sibling = sibling.nextElementSibling;
      }
    }

    if (panel && panel !== button) {
      // Wait for panel contents to render — poll until buttons appear (up to 1s for async data)
      let contentWait = 0;
      while (contentWait < 1000) {
        await new Promise((r) => setTimeout(r, 100));
        contentWait += 100;
        const btns = panel.querySelectorAll("button");
        // Need at least one button that's not just a search wrapper
        let realBtns = 0;
        for (const b of btns) {
          if (!b.querySelector("input")) realBtns++;
        }
        if (realBtns > 0) break;
      }

      // Get all clickable items inside the panel (skip search inputs and utility buttons)
      const clickables = panel.querySelectorAll("button, [role=option], [data-value], li");
      const filtered: Element[] = [];
      for (const c of clickables) {
        // Skip search inputs, clear buttons, close buttons
        const text = c.textContent?.trim() || "";
        if (!text || text === "×" || text === "✕") continue;
        if ((c as HTMLElement).querySelector("input")) continue;
        // Skip if it looks like the trigger button itself
        if (c === button) continue;
        // Skip if it's a search input wrapper
        const hasInput = c.querySelector("input[type='text'], input[type='search']");
        if (hasInput) continue;
        filtered.push(c);
      }

      if (filtered.length > 0) {
        options = filtered;
        listbox = panel;
      }
    }
  }

  if (options.length > 0) {
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
      const isPlaceholder = text.startsWith("select") || text === "" || text === "---" || text === "choose" || text.startsWith("choose") || text.startsWith("search");
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
        setNativeValue(el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, item.value);
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
