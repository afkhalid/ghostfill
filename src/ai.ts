import type { DetectedField, FieldFillData, GhostFillOptions } from "./types";
import { describeFields } from "./detector";

const SYSTEM_PROMPT = `You are a form-filling assistant. Given a list of form fields and a user prompt, generate realistic fake data to fill each field.

Rules:
- Return ONLY a JSON array of objects with "index" and "value" keys
- Match the field type (email → valid email, phone → valid phone, etc.)
- For select fields, pick from the available options
- For checkboxes, add a "checked" boolean
- For radio buttons, only fill one per group
- Respect min/max constraints and patterns
- Generate contextually coherent data (same person's name, matching city/state, etc.)
- Do NOT wrap the JSON in markdown code blocks — return raw JSON only`;

/** Call OpenAI to generate fill data */
export async function generateFillData(
  fields: DetectedField[],
  userPrompt: string,
  options: GhostFillOptions
): Promise<FieldFillData[]> {
  const fieldDescription = describeFields(fields);

  const messages = [
    {
      role: "system" as const,
      content: options.systemPrompt
        ? `${options.systemPrompt}\n\n${SYSTEM_PROMPT}`
        : SYSTEM_PROMPT,
    },
    {
      role: "user" as const,
      content: `Form fields:\n${fieldDescription}\n\nUser prompt: ${userPrompt}`,
    },
  ];

  const model = options.model || "gpt-4o-mini";
  const baseURL = options.baseURL || "https://api.openai.com/v1";

  const response = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No content in OpenAI response");
  }

  const parsed = JSON.parse(content);

  // Handle both { fields: [...] } and direct array
  const arr = Array.isArray(parsed) ? parsed : parsed.fields || parsed.data || parsed.items || [];

  if (!Array.isArray(arr)) {
    throw new Error("AI response is not an array of field fills");
  }

  return arr as FieldFillData[];
}
