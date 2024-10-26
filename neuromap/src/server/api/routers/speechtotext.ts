import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient();

export const speechRouter = createTRPCRouter({
  saveSpeechToText: protectedProcedure
    .input(z.object({ text: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { text } = input;
      const userId = ctx.session.user.id;

      try {
        const speechToText = await prisma.speechToText.create({
          data: {
            userId: userId,
            text: text,
          },
        });

        //await sendToDjango(userId, text);

        return speechToText;
      } catch (error) {
        console.error('Error saving speech to text:', error);
        throw new Error('Error saving speech to text');
      }
    }),
});

// Function to send transcription to Django endpoint
async function sendToDjango(userId: string, text: string) {
  try {
    const response = await fetch("http://127.0.0.1:8000/api/upload-text/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        transcription: text,
      }),
    });

    if (!response.ok) {
      console.error("Failed to send transcription to Django:", await response.json());
      throw new Error("Failed to send transcription to Django");
    }

    console.log("Successfully sent transcription to Django");
  } catch (error) {
    console.error("Error sending transcription to Django:", error);
    throw new Error("Error sending transcription to Django");
  }
}
