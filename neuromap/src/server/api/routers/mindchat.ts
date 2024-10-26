import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { createMindchatAgent } from "@/lib/mindchatAgent";
import { observable } from '@trpc/server/observable';
import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";

// Add a type for the agent response
// type AgentResponse = {
//   output: string;
//   // Add other properties if they exist in the actual response
// };

async function getRelevantContext(userId: string, input: string) {
  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
  });

  const index = pinecone.Index(process.env.PINECONE_INDEX_NAME!);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Generate embedding for the input
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: input.trim(),
  });
  const inputEmbedding = embeddingResponse.data[0]?.embedding;

  if (!inputEmbedding) {
    throw new Error("Failed to generate embedding for input");
  }

  // Query Pinecone for similar vectors
  const queryResponse = await index.query({
    vector: inputEmbedding,
    topK: 5,
    includeMetadata: true,
    filter: { userId: userId }
  });

  // Extract and return the relevant context
  return queryResponse.matches.map(match => match.metadata?.text).join(" ");
}

export const mindchatRouter = createTRPCRouter({
  chat: protectedProcedure
    .input(z.object({
      message: z.string(),
      history: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string()
      }))
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { message, history } = input;

      const relevantContext = await getRelevantContext(userId, message);

      const agent = await createMindchatAgent(userId);
      
      const response: string = await agent.call({
        input: message,
        chat_history: history.map(msg => `${msg.role}: ${msg.content}`).join('\n'),
        relevant_context: relevantContext
      });

      return response; // Return the string directly
    }),

  streamChat: protectedProcedure
    .input(z.object({
      message: z.string(),
      history: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string()
      }))
    }))
    .subscription(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { message, history } = input;

      const relevantContext = await getRelevantContext(userId, message);

      const agent = await createMindchatAgent(userId);

      return observable<string>((emit) => {
        void (async () => {
          try {
            const response = await agent.call({
              input: message,
              chat_history: history.map(msg => `${msg.role}: ${msg.content}`).join('\n'),
              relevant_context: relevantContext
            });

            // Type guard to ensure response is a string
            if (typeof response === 'string') {
              const words = response.split(' ');
              for (const word of words) {
                emit.next(word + ' ');
                await new Promise(resolve => setTimeout(resolve, 50));
              }
            } else {
              throw new Error('Unexpected response type from agent');
            }
            emit.complete();
          } catch (error) {
            emit.error(error instanceof Error ? error : new Error('Unknown error occurred'));
          }
        })();

        return () => {
          // Cleanup if needed
        };
      });
    }),
});
