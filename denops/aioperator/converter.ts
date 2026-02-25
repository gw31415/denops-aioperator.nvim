import OpenAI from "@openai/openai";
import { OpenAIRealtimeWebSocket } from "@openai/openai/beta/realtime/websocket";
import { DEFAULT_MODEL } from "./main.ts";

/**
 * Convert the source text according to the given instruction.
 */
export async function* convert(
  instruction: string,
  source: string,
  openaiOpts: Record<string, unknown>,
): AsyncGenerator<string> {
  const apiKey = typeof openaiOpts.api_key === "string"
    ? openaiOpts.api_key
    : "";
  if (!apiKey) {
    throw new Error(
      "OpenAI API key is missing: set openai.api_key or OPENAI_API_KEY",
    );
  }
  const model = typeof openaiOpts.model === "string"
    ? openaiOpts.model
    : DEFAULT_MODEL;

  const client = new OpenAI({ apiKey });
  const rt = new OpenAIRealtimeWebSocket({ model }, client);

  const queue: string[] = [];
  let queueHead = 0;
  let done = false;
  let streamError: Error | null = null;
  let wake: (() => void) | null = null;

  const notify = () => {
    if (wake) {
      wake();
      wake = null;
    }
  };
  const push = (value: string) => {
    queue.push(value);
    notify();
  };
  const fail = (error: Error) => {
    streamError = error;
    done = true;
    notify();
  };
  const finish = () => {
    done = true;
    notify();
  };

  const opened = new Promise<void>((resolve, reject) => {
    rt.socket.addEventListener("open", () => resolve(), { once: true });
    rt.socket.addEventListener("error", () => {
      reject(new Error("Failed to open WebSocket connection"));
    }, { once: true });
    rt.socket.addEventListener("close", () => {
      reject(new Error("WebSocket connection was closed before opening"));
    }, { once: true });
  });

  rt.on("response.text.delta", (event) => {
    push(event.delta);
  });
  rt.on("response.done", () => {
    finish();
    rt.close();
  });
  rt.socket.addEventListener("close", () => {
    if (!done && !streamError) {
      fail(new Error("WebSocket connection was closed unexpectedly"));
    }
  });
  rt.on("error", (error) => {
    fail(error instanceof Error ? error : new Error(String(error)));
    rt.close();
  });

  await opened;

  rt.send({
    type: "response.create",
    response: {
      modalities: ["text"],
      instructions:
        "You rewrite text exactly as requested. Return only the rewritten text without explanations, markdown fences, or surrounding quotes.",
      input: [
        {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Order: ${instruction}\n\nSource:\n${source}`,
            },
          ],
        },
      ],
    },
  });

  while (!done || queueHead < queue.length) {
    if (streamError) {
      throw streamError;
    }

    if (queueHead < queue.length) {
      const next = queue[queueHead++];
      if (queueHead >= 1024 && queueHead * 2 >= queue.length) {
        queue.splice(0, queueHead);
        queueHead = 0;
      }
      if (next !== undefined) {
        yield next;
      }
      continue;
    }

    await new Promise<void>((resolve) => {
      wake = resolve;
    });
  }

  if (streamError) {
    throw streamError;
  }
}
