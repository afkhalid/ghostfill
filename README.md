# GhostFill

Dev tool that fills form fields with sample data. Select a block, click fill — done.

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
    import("ghostfill").then((m) =>
      m.init({
        ai: {
          endpoint: "/api/ghostfill",
          provider: "openai",
        },
      })
    );
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
4. By default, generates random sample data locally (no API needed)
5. Optionally enable AI mode in settings for context-aware data generation through your backend

## Secure AI Setup

GhostFill no longer accepts provider API keys in the browser. To use OpenAI, xAI, or Moonshot safely, expose a backend route and keep provider credentials server-side.

Install a server-side SDK in your app:

```bash
npm install openai
```

Example Next.js route:

```ts
// app/api/ghostfill/route.ts
import OpenAI from "openai";
import {
  buildFillMessages,
  parseFillDataPayload,
  type GhostFillAIRequest,
  type Provider,
} from "ghostfill/server";

const clients: Record<Provider, OpenAI> = {
  openai: new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  }),
  xai: new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: "https://api.x.ai/v1",
  }),
  moonshot: new OpenAI({
    apiKey: process.env.MOONSHOT_API_KEY,
    baseURL: "https://api.moonshot.cn/v1",
  }),
};

const models: Record<Provider, string> = {
  openai: process.env.GHOSTFILL_OPENAI_MODEL || "gpt-4o-mini",
  xai: process.env.GHOSTFILL_XAI_MODEL || "grok-4-fast",
  moonshot: process.env.GHOSTFILL_MOONSHOT_MODEL || "moonshot-v1-8k",
};

function isProvider(value: unknown): value is Provider {
  return value === "openai" || value === "xai" || value === "moonshot";
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<GhostFillAIRequest>;

  if (!isProvider(body.provider) || !Array.isArray(body.fields)) {
    return Response.json({ error: "Invalid GhostFill request" }, { status: 400 });
  }

  const completion = await clients[body.provider].chat.completions.create({
    model: models[body.provider],
    messages: buildFillMessages({
      provider: body.provider,
      prompt: typeof body.prompt === "string" ? body.prompt : "",
      systemPrompt:
        typeof body.systemPrompt === "string" ? body.systemPrompt : undefined,
      fields: body.fields,
    }),
  });

  const content = completion.choices[0]?.message?.content || "";
  return Response.json(parseFillDataPayload(content));
}
```

This route supports all three providers, keeps secrets server-side, and only sends non-secret field metadata to the model. If you expose it outside local development, add your app's auth, rate limits, and request-size validation.

## Settings

Click the gear icon to configure:

- **Highlight Colour** — pick the selection overlay color
- **Use AI** — toggle AI-powered fills when a secure backend route is configured
- **Provider** — cycle between OpenAI, xAI, and Moonshot
- **Backend** — shows the secure route or handler being used for AI fills
- **Presets** — save prompt templates for domain-specific data (e.g. D365, healthcare); keep them non-secret because they are stored locally
- **Dark/Light theme** — toggle with the sun/moon icon

## Features

- **Zero config** — works out of the box with random sample data
- **Secure by default** — AI mode uses a backend route instead of browser-held provider keys
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
  ai?: {
    endpoint?: string,         // Same-origin backend route (default: "/api/ghostfill")
    requestFillData?: (request: GhostFillAIRequest) => Promise<FieldFillData[]>,
    provider?: "openai" | "xai" | "moonshot"
  },
  shortcut?: string,           // Keyboard shortcut (default: "Alt+G")
  systemPrompt?: string        // Custom system prompt to prepend
})
```

Returns `{ destroy: () => void }` to remove the UI.

### `fill(params)`

Programmatic fill without the UI.

```ts
await fill({
  container: HTMLElement,  // The element containing form fields
  prompt?: string,         // Optional prompt for AI mode
  ai?: {
    endpoint?: string,
    requestFillData?: (request: GhostFillAIRequest) => Promise<FieldFillData[]>,
    provider?: "openai" | "xai" | "moonshot"
  },
  provider?: "openai" | "xai" | "moonshot",
  systemPrompt?: string
})
```

Returns `{ filled: number, errors: string[] }`.

## License

MIT
