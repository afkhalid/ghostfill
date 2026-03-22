import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { generateFakeData } from "./faker";
import { buildFillMessages, parseFillDataPayload } from "./ai";
import { PROVIDERS } from "./types";
import type { DetectedField, GhostFillAIRequest, Provider } from "./types";

const FieldSchema = z.object({
  label: z.string().describe("Field label or visible name"),
  type: z.string().describe("Field type: text, email, tel, select, checkbox, radio, date, datetime-local, number, textarea, password, url, etc."),
  name: z.string().optional().default("").describe("Field name attribute"),
  options: z.array(z.string()).optional().describe("For select/radio fields, the available option values"),
  required: z.boolean().optional().default(false),
  min: z.string().optional().describe("Minimum value constraint"),
  max: z.string().optional().describe("Maximum value constraint"),
  pattern: z.string().optional().describe("Regex pattern constraint"),
});

function toDetectedFields(fields: z.infer<typeof FieldSchema>[]): DetectedField[] {
  return fields.map((f) => ({
    element: null as unknown as HTMLElement,
    currentValue: "",
    type: f.type,
    name: f.name ?? "",
    label: f.label,
    options: f.options,
    required: f.required ?? false,
    min: f.min,
    max: f.max,
    pattern: f.pattern,
  }));
}

const server = new McpServer({
  name: "ghostfill",
  version: "0.2.4",
});

server.tool(
  "ghostfill_generate",
  "Generate realistic fake data for form fields. No API key required. Pass field descriptions and get back fill data with coherent identity (matching name, email, company, etc.).",
  {
    fields: z.array(FieldSchema).describe("Array of form field descriptions to generate data for"),
  },
  async ({ fields }) => {
    const result = generateFakeData(toDetectedFields(fields));
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "ghostfill_generate_ai",
  "Generate contextually-aware form data using an AI provider (OpenAI, xAI, or Moonshot). Produces more intelligent, context-sensitive data than local generation.",
  {
    fields: z.array(FieldSchema).describe("Array of form field descriptions"),
    provider: z.enum(["openai", "xai", "moonshot"]).optional().default("openai").describe("AI provider to use"),
    apiKey: z.string().describe("API key for the chosen provider"),
    prompt: z.string().optional().default("").describe("Optional instructions for what kind of data to generate"),
    systemPrompt: z.string().optional().describe("Optional custom system prompt to prepend"),
  },
  async ({ fields, provider, apiKey, prompt, systemPrompt }) => {
    const promptFields = fields.map((f, i) => ({
      index: i,
      type: f.type,
      name: f.name ?? "",
      label: f.label,
      options: f.options,
      required: f.required ?? false,
      min: f.min,
      max: f.max,
      pattern: f.pattern,
    }));

    const request: GhostFillAIRequest = {
      provider: provider as Provider,
      prompt: prompt ?? "",
      systemPrompt,
      fields: promptFields,
    };

    const messages = buildFillMessages(request);
    const providerConfig = PROVIDERS[provider as Provider] ?? PROVIDERS.openai;

    const response = await fetch(`${providerConfig.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: providerConfig.model,
        messages,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        content: [{ type: "text" as const, text: `AI API error (${response.status}): ${errorText}` }],
        isError: true,
      };
    }

    const payload = await response.json();
    const result = parseFillDataPayload(payload);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
