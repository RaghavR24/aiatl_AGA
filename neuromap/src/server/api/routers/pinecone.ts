import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";

export const pineconeRouter = createTRPCRouter({
  upsertTranscript: protectedProcedure
    .input(z.object({ text: z.string() }))
    .mutation(async ({ input, ctx }) => {
      console.log("Starting upsertTranscript mutation");

      try {
        const pinecone = new Pinecone({
          apiKey: process.env.PINECONE_API_KEY!,
        });
        console.log("Pinecone client initialized");

        const index = pinecone.Index(process.env.PINECONE_INDEX_NAME!);
        console.log("Pinecone index accessed");

        // Initialize OpenAI client
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        console.log("OpenAI client initialized");

        // Updated splitIntoChunks function
        function splitIntoChunks(text: string, chunkSize: number = 256, overlap: number = 40): string[] {
          console.log(`splitIntoChunks called with text length: ${text.length}, chunkSize: ${chunkSize}, overlap: ${overlap}`);
          
          const minChunkSize = 40; // Minimum chunk size to avoid embedding errors
          if (text.length <= chunkSize) {
            console.log("Text length <= chunkSize, returning single chunk");
            return [text];
          }

          const chunks: string[] = [];
          let startIndex = 0;

          while (startIndex < text.length) {
            console.log(`Current startIndex: ${startIndex}`);
            let endIndex = Math.min(startIndex + chunkSize, text.length);
            console.log(`Calculated endIndex: ${endIndex}`);
            
            // If the remaining text is smaller than chunkSize, make it the last chunk
            if (text.length - startIndex <= chunkSize) {
              console.log(`Remaining text <= chunkSize, creating final chunk`);
              chunks.push(text.slice(startIndex));
              break;
            }

            const chunk = text.slice(startIndex, endIndex);
            console.log(`Adding chunk with length: ${chunk.length}`);
            chunks.push(chunk);
            
            // Move startIndex forward, ensuring we don't create tiny chunks
            startIndex += chunkSize - overlap;
            // Ensure we don't go backwards or stay in place
            startIndex = Math.max(startIndex, endIndex - overlap, chunks.length * minChunkSize);
            // Ensure startIndex doesn't go past the end of the text
            startIndex = Math.min(startIndex, text.length);
            console.log(`New startIndex after adjustment: ${startIndex}`);
          }

          console.log(`Total chunks created: ${chunks.length}`);
          return chunks;
        }

        console.log("Embedding full text");
        const fullEmbedding = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: input.text,
        });
        console.log("Full text embedded successfully");

        // Prepare the full text vector
        const fullVector = {
          id: `${ctx.session.user.id}-${Date.now()}-full`,
          values: fullEmbedding.data[0]?.embedding ?? [],
          metadata: { text: input.text, userId: ctx.session.user.id, isFullText: true },
        };
        console.log("Full vector prepared");

        // Split the text into chunks if necessary
        const chunks = splitIntoChunks(input.text);
        console.log(`Text split into ${chunks.length} chunks`);

        // Prepare chunk vectors if there are multiple chunks
        console.log("Preparing chunk vectors");
        const chunkVectors = chunks.length > 1 ? await Promise.all(
          chunks.map(async (chunk, index) => {
            console.log(`Embedding chunk ${index + 1}/${chunks.length}`);
            const response = await openai.embeddings.create({
              model: "text-embedding-3-small",
              input: chunk,
            });
            return {
              id: `${ctx.session.user.id}-${Date.now()}-chunk-${index}`,
              values: response.data[0]?.embedding ?? [],
              metadata: { text: chunk, userId: ctx.session.user.id, isFullText: false },
            };
          })
        ) : [];
        console.log("Chunk vectors prepared");

        // Combine full text vector and chunk vectors
        const vectors = [fullVector, ...chunkVectors].filter(vector => vector.values.length > 0);
        console.log(`Total vectors to upsert: ${vectors.length}`);

        // Upsert vectors to Pinecone
        console.log("Upserting vectors to Pinecone");
        await index.upsert(vectors);
        console.log("Vectors upserted successfully");

        return { success: true };
      } catch (error) {
        console.error("Error in upsertTranscript:", error);
        throw error; // Re-throw the error to be handled by the tRPC error handling
      }
    }),
});
