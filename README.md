# GhostFill

Dev tool that fills form fields with fake data. Select a block, click fill — done.

Works with any framework (React, Vue, Angular, vanilla). Detects inputs, textareas, selects, checkboxes, radios, date pickers, and custom dropdowns (Headless UI, Radix).

## Install

```bash
npm install ghostfill -D
```

## Usage

### Vanilla JS

```js
import { init } from "ghostfill";

init();
```

### React / Next.js

```tsx
// app.tsx or layout.tsx
import { useEffect } from "react";

function GhostFill() {
  useEffect(() => {
    import("ghostfill").then((m) => m.init());
  }, []);
  return null;
}

// In your app:
{process.env.NODE_ENV === "development" && <GhostFill />}
```

### Programmatic

```js
import { fill } from "ghostfill";

await fill({ container: document.querySelector("form") });
```

## How it works

1. A ghost icon appears on the page (starts minimized)
2. Click it to enter selection mode — hover and click a form area
3. Click the sparkles button to fill all detected fields
4. By default, generates random fake data locally (no API needed)
5. Optionally enable AI mode in settings for context-aware data generation

## Settings

Click the gear icon to configure:

- **Highlight Colour** — pick the selection overlay color
- **Use AI** — toggle AI-powered fills (requires API key)
- **Provider** — cycle between OpenAI (gpt-4o-mini), xAI (Grok 4 Fast), Moonshot (Kimi K2)
- **API Key** — your provider API key
- **Presets** — save prompt templates for domain-specific data (e.g. D365, healthcare)
- **Dark/Light theme** — toggle with the sun/moon icon

## Features

- **Zero config** — works out of the box with random fake data
- **Shadow DOM** — styles don't leak into your app
- **Framework-aware** — uses native value setters so React/Vue/Angular pick up changes
- **Smart detection** — labels from `<label>`, `aria-label`, placeholder, preceding siblings
- **Custom dropdowns** — handles Headless UI Listbox, Radix Select, and other `role="listbox"` components
- **Draggable** — drag the toolbar or minimized icon anywhere
- **Presets** — save and reuse prompt templates
- **Dark/Light mode** — matches your preference
- **Keyboard shortcut** — `Alt+G` to toggle

## API

### `init(options?)`

Initialize GhostFill and add the UI to the page.

```ts
init({
  apiKey?: string,      // API key (can also set in UI)
  shortcut?: string,    // Keyboard shortcut (default: "Alt+G")
  systemPrompt?: string // Custom system prompt to prepend
})
```

Returns `{ destroy: () => void }` to remove the UI.

### `fill(params)`

Programmatic fill without the UI.

```ts
await fill({
  container: HTMLElement,  // The element containing form fields
  prompt?: string          // Optional prompt for AI mode
})
```

Returns `{ filled: number, errors: string[] }`.

## License

MIT
