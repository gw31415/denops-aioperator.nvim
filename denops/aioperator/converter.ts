import { z } from "zod";
import { zodToJsonSchema } from "npm:zod-to-json-schema";
import { ChatOpenAI, ChatOpenAICallOptions } from "@langchain/openai";
import { JsonOutputFunctionsParser } from "langchain/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";

/**
 * Convert text according to a given order.
 */
export async function* convert(
  model: ChatOpenAI<ChatOpenAICallOptions>,
  order: string,
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
    "Convert text according to [Order: {order}]:\n {source}",
  );

  const chain = prompt
    .pipe(model.bind(modelParams))
    .pipe(new JsonOutputFunctionsParser());

  const stream = await chain.stream({
    order,
    source,
  });
  for await (const chunk of stream) {
    const { text }: { text: string } = chunk;
    yield text;
  }
}
