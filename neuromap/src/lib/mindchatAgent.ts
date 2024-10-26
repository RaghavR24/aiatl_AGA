import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { LLMChain } from "langchain/chains";

export const MINDCHAT_TEMPLATE = `
You are an AI assistant named Mindchat, designed to help users interact with their memories and notes. Your responses should be helpful, empathetic, and tailored to the user's context.

Analyze the following user input and provide a response. Use the relevant context provided to inform your answer, but don't explicitly mention it unless it's directly relevant to the user's question.

Relevant Context:
{relevant_context}

Chat History:
{chat_history}

User input: {input}

Your Response:
`;

export async function createMindchatAgent(userId: string) {
  const model = new ChatOpenAI({ 
    modelName: "gpt-3.5-turbo",
    streaming: true
  });

  const prompt = new PromptTemplate({
    template: MINDCHAT_TEMPLATE,
    inputVariables: ["input", "chat_history", "relevant_context"],
  });

  const chain = new LLMChain({ llm: model, prompt });

  return {
    call: async ({ input, chat_history, relevant_context }: { input: string; chat_history: string; relevant_context: string }) => {
      console.log("Relevant context:", relevant_context);
      const response = await chain.call({ input, chat_history, relevant_context });
      return response.text;
    }
  };
}

// ... rest of the file ...
