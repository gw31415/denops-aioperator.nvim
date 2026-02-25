import { isString } from "@core/unknownutil";
import type { Denops } from "@denops/core";
import { convert } from "./converter.ts";

export const DEFAULT_MODEL = "gpt-5-mini";

export function main(denops: Denops) {
  denops.dispatcher = {
    async start(instruction, source, openai, responseWriterFuncId) {
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
        api_key: Deno.env.get("OPENAI_API_KEY") ?? "",
        model: DEFAULT_MODEL,
        ...userOpenAIOpts,
      };

      const stream = convert(instruction, source, openaiOpts);

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
