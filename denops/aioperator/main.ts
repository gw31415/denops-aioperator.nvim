import { ChatOpenAI } from "npm:@langchain/openai";
import { isString } from "jsr:@core/unknownutil";
import type { Denops } from "jsr:@denops/std";
import { convert } from "./converter.ts";

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
			const openaiOpts = Object.assign(
				{
					model: "gpt-4o",
					apiKey: Deno.env.get("OPENAI_API_KEY") ?? "",
					temperature: 0,
				},
				openai,
			);

			const model = new ChatOpenAI(openaiOpts);
			const stream = convert(model, instruction, source);

			// Stream a diff as JSON patch operations
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
