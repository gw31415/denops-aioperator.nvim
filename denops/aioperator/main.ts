import OpenAI from "jsr:@openai/openai";
import { isString } from "jsr:@core/unknownutil";
import type { Denops } from "jsr:@denops/std";
import { convert } from "./converter.ts";

export const DEFAULT_MODEL = "gpt-5-mini";

export function main(denops: Denops) {
  denops.dispatcher = {
    async start(
      instruction: unknown,
      source: unknown,
      openai: unknown,
      responseWriterFuncId: unknown,
    ) {
      if (!isString(instruction)) {
        throw new Error("Order must be a string");
      }
      if (!isString(source)) {
        throw new Error("Source must be a string");
      }
      if (!isString(responseWriterFuncId)) {
        throw new Error("Response writer ID must be a string");
      }

      const userOpenAIOpts = (typeof openai === "object" && openai !== null)
        ? openai as Record<string, unknown>
        : {};

      const openaiOpts: Record<string, unknown> = {
        model: DEFAULT_MODEL,
        apiKey: Deno.env.get("OPENAI_API_KEY") ?? "",
        temperature: 0,
        ...userOpenAIOpts,
      };

      const client = new OpenAI({
        apiKey: typeof openaiOpts.apiKey === "string" ? openaiOpts.apiKey : "",
        baseURL: typeof openaiOpts.baseURL === "string"
          ? openaiOpts.baseURL
          : undefined,
        organization: typeof openaiOpts.organization === "string"
          ? openaiOpts.organization
          : undefined,
        project: typeof openaiOpts.project === "string"
          ? openaiOpts.project
          : undefined,
      });

      const stream = convert(client, instruction, source, openaiOpts);

      // Stream replacement text incrementally.
      for await (const replacement of stream) {
        await denops.call(
          "denops#callback#call",
          responseWriterFuncId,
          replacement,
        );
      }
    },
  };
}
