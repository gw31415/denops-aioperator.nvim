import { isString } from "@core/unknownutil";
import type { Denops } from "@denops/core";
import { convert } from "./converter.ts";

export const DEFAULT_MODEL = "gpt-realtime-mini";
const FLUSH_INTERVAL_MS = 16;
const MAX_BATCH_CHARS = 512;

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
      let pending = "";
      let lastFlushAt = performance.now();

      const flush = async () => {
        if (pending.length === 0) {
          return;
        }
        const text = pending;
        pending = "";
        lastFlushAt = performance.now();
        await denops.call(
          "denops#callback#call",
          responseWriterFuncId,
          { type: "delta", text },
        );
      };

      try {
        // Stream text deltas incrementally with short batching to reduce RPC overhead.
        for await (const event of stream) {
          if (event.type === "opened") {
            await denops.call(
              "denops#callback#call",
              responseWriterFuncId,
              { type: "opened" },
            );
            continue;
          }

          const delta = event.text;
          pending += delta;

          const now = performance.now();
          const shouldFlush = pending.length >= MAX_BATCH_CHARS ||
            (now - lastFlushAt) >= FLUSH_INTERVAL_MS ||
            delta.includes("\n");
          if (shouldFlush) {
            await flush();
          }
        }
      } finally {
        await flush();
        await denops.call(
          "denops#callback#call",
          responseWriterFuncId,
          { type: "done" },
        );
      }
    },
  };
}
