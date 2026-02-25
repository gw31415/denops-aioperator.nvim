import type OpenAI from "@openai/openai";
import { DEFAULT_MODEL, DEFAULT_TEMPERATURE } from "./main.ts";

/**
 * Convert the source text according to the given instruction.
 */
export async function* convert(
  client: OpenAI,
  instruction: string,
  source: string,
  openaiOpts: Record<string, unknown>,
): AsyncGenerator<string> {
  const {
    apiKey: _apiKey,
    baseURL: _baseURL,
    organization: _organization,
    project: _project,
    ...requestOptions
  } = openaiOpts;

  const stream = await client.chat.completions.create({
    ...requestOptions,
    model: typeof requestOptions.model === "string"
      ? requestOptions.model
      : DEFAULT_MODEL,
    temperature: typeof requestOptions.temperature === "number"
      ? requestOptions.temperature
      : DEFAULT_TEMPERATURE,
    stream: true,
    messages: [
      {
        role: "system",
        content:
          "You rewrite text exactly as requested. Return only the rewritten text without explanations, markdown fences, or surrounding quotes.",
      },
      {
        role: "user",
        content: `Order: ${instruction}\n\nSource:\n${source}`,
      },
    ],
  });

  let replacement = "";
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (!delta) {
      continue;
    }
    replacement += delta;
    yield replacement;
  }
}
