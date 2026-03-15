import type { DetectedField, FieldFillData, GhostFillSettings, Provider, GhostFillOptions } from "./types";
import { PROVIDERS } from "./types";
import { describeFields } from "./detector";

const SYSTEM_PROMPT = `You are a form-filling assistant. Given a list of form fields, page context, and an optional user prompt, generate realistic fake data to fill ALL fields.

Rules:
- Return ONLY a JSON object with a "fields" array of objects, each with "index" and "value" keys
- You MUST fill EVERY field — do not skip any
- Match the field type (email → valid email, phone → valid phone with country code, date → YYYY-MM-DD, datetime-local → YYYY-MM-DDTHH:MM, etc.)
- For select/dropdown fields: you MUST pick one of the listed options EXACTLY as written
- For checkboxes: add a "checked" boolean (true or false)
- For radio buttons: only fill one per group, use the option value
- Respect min/max constraints and patterns
- Generate contextually coherent data (same person's name, matching city/state/zip, etc.)
- Use the page context to infer what kind of data makes sense (e.g. a "Create Project" form → project-related data)
- If no user prompt is given, infer appropriate data from the field labels and page context
- Do NOT wrap the JSON in markdown code blocks — return raw JSON only`;

/** Call LLM API to generate fill data */
export async function generateFillData(
  fields: DetectedField[],
  userPrompt: string,
  settings: GhostFillSettings,
  systemPrompt?: string,
  blockContext?: string
): Promise<FieldFillData[]> {
  const fieldDescription = describeFields(fields);
  const provider = PROVIDERS[settings.provider] || PROVIDERS.openai;

  let userContent = `Form fields:\n${fieldDescription}`;

  if (blockContext) {
    userContent += `\n\nPage context:\n${blockContext}`;
  }

  if (userPrompt) {
    userContent += `\n\nUser instructions: ${userPrompt}`;
  } else {
    userContent += `\n\nNo specific instructions — generate realistic, contextually appropriate data for all fields.`;
  }

  const messages = [
    {
      role: "system" as const,
      content: systemPrompt
        ? `${systemPrompt}\n\n${SYSTEM_PROMPT}`
        : SYSTEM_PROMPT,
    },
    {
      role: "user" as const,
      content: userContent,
    },
  ];

  const body: Record<string, unknown> = {
    model: provider.model,
    messages,
    temperature: 0.7,
  };

  // json_object response format not supported by all providers
  if (settings.provider === "openai") {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(`${provider.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No content in API response");
  }

  // Extract JSON from possible markdown code blocks
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
  const jsonStr = jsonMatch[1]!.trim();
  const parsed = JSON.parse(jsonStr);

  const arr = Array.isArray(parsed)
    ? parsed
    : parsed.fields || parsed.data || parsed.items || [];

  if (!Array.isArray(arr)) {
    throw new Error("AI response is not an array of field fills");
  }

  return arr as FieldFillData[];
}
