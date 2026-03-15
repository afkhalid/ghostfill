import { describeFields } from "./detector";
import type {
  DetectedField,
  FieldFillData,
  GhostFillAIOptions,
  GhostFillAIRequest,
  GhostFillPromptField,
  Provider,
} from "./types";

export const SYSTEM_PROMPT = `You are a form-filling assistant. Given a list of form fields and an optional user prompt, generate realistic fake data to fill ALL fields.

Rules:
- Return ONLY a JSON object with a "fields" array of objects, each with "index" and "value" keys
- You MUST fill EVERY field — do not skip any
- Match the field type (email → valid email, phone → valid phone with country code, date → YYYY-MM-DD, datetime-local → YYYY-MM-DDTHH:MM, etc.)
- For select/dropdown fields: you MUST pick one of the listed options EXACTLY as written
- For checkboxes: add a "checked" boolean (true or false)
- For radio buttons: only fill one per group, use the option value
- Respect min/max constraints and patterns
- Generate contextually coherent data (same person's name, matching city/state/zip, etc.)
- If no user prompt is given, infer appropriate data from the field labels
- Do NOT request or rely on secrets, tokens, passwords, or existing form values
- Do NOT wrap the JSON in markdown code blocks — return raw JSON only`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toFieldFillData(value: unknown): FieldFillData {
  if (!isRecord(value)) {
    throw new Error("AI response item is not an object");
  }

  const index = value.index;
  const rawValue = value.value;
  const checked = value.checked;

  if (typeof index !== "number" || !Number.isInteger(index)) {
    throw new Error("AI response item is missing a numeric index");
  }

  if (typeof rawValue !== "string") {
    throw new Error("AI response item is missing a string value");
  }

  return {
    index,
    value: rawValue,
    checked: typeof checked === "boolean" ? checked : undefined,
  };
}

export function toPromptFields(fields: DetectedField[]): GhostFillPromptField[] {
  return fields.map((field, index) => ({
    index,
    type: field.type,
    name: field.name,
    label: field.label,
    options: field.options,
    required: field.required,
    min: field.min,
    max: field.max,
    pattern: field.pattern,
  }));
}

export function buildFillMessages(
  request: GhostFillAIRequest
): Array<{ role: "system" | "user"; content: string }> {
  const fieldDescription = describeFields(request.fields);
  let userContent = `Form fields:\n${fieldDescription}`;

  if (request.prompt) {
    userContent += `\n\nUser instructions: ${request.prompt}`;
  } else {
    userContent +=
      "\n\nNo specific instructions — generate realistic, contextually appropriate data for all fields.";
  }

  return [
    {
      role: "system",
      content: request.systemPrompt
        ? `${request.systemPrompt}\n\n${SYSTEM_PROMPT}`
        : SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: userContent,
    },
  ];
}

export function parseFillDataPayload(payload: unknown): FieldFillData[] {
  if (typeof payload === "string") {
    const jsonMatch =
      payload.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, payload];
    return parseFillDataPayload(JSON.parse(jsonMatch[1]!.trim()));
  }

  if (Array.isArray(payload)) {
    return payload.map(toFieldFillData);
  }

  if (isRecord(payload)) {
    if (Array.isArray(payload.choices)) {
      const content = (payload.choices[0] as Record<string, unknown> | undefined)
        ?.message as Record<string, unknown> | undefined;
      if (typeof content?.content === "string") {
        return parseFillDataPayload(content.content);
      }
    }

    const candidate =
      payload.fields ?? payload.data ?? payload.items ?? payload.result;
    if (Array.isArray(candidate)) {
      return candidate.map(toFieldFillData);
    }
  }

  throw new Error("AI response is not an array of field fills");
}

function createRequest(
  fields: DetectedField[],
  userPrompt: string,
  provider: Provider,
  systemPrompt?: string
): GhostFillAIRequest {
  return {
    provider,
    prompt: userPrompt,
    systemPrompt,
    fields: toPromptFields(fields),
  };
}

/** Call a secure backend or callback to generate fill data. */
export async function generateFillData(
  fields: DetectedField[],
  userPrompt: string,
  provider: Provider,
  transport: GhostFillAIOptions,
  systemPrompt?: string
): Promise<FieldFillData[]> {
  const request = createRequest(fields, userPrompt, provider, systemPrompt);

  if (transport.requestFillData) {
    return transport.requestFillData(request);
  }

  const endpoint = transport.endpoint ?? "/api/ghostfill";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI API error (${response.status}): ${error}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  return parseFillDataPayload(payload);
}
