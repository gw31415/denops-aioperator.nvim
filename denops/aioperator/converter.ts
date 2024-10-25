import { ChatPromptTemplate } from "npm:@langchain/core/prompts";
import type { ChatOpenAI, ChatOpenAICallOptions } from "npm:@langchain/openai";
import { JsonOutputFunctionsParser } from "npm:langchain/output_parsers";
import { z } from "npm:zod";
import { zodToJsonSchema } from "npm:zod-to-json-schema";

/**
 * Convert the source text according to the given instruction.
 */
export async function* convert(
	model: ChatOpenAI<ChatOpenAICallOptions>,
	instruction: string,
	source: string,
): AsyncGenerator<string> {
	const modelParams = {
		functions: [
			{
				name: "replace",
				description: "Replace a string with another string",
				parameters: zodToJsonSchema(
					z.object({
						text: z
							.string()
							.describe(
								"The post-conversion string to replace the pre-conversion location.",
							),
					}),
				),
			},
		],
		function_call: { name: "replace" },
	};

	const prompt = ChatPromptTemplate.fromTemplate(
		"Convert text according to [Order: {instruction}]:\n {source}",
	);

	const chain = prompt
		.pipe(model.bind(modelParams))
		.pipe(new JsonOutputFunctionsParser());

	const stream = await chain.stream({
		instruction,
		source,
	});
	for await (const chunk of stream) {
		const { text }: { text: string } = chunk;
		yield text;
	}
}
