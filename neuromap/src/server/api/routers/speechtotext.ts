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

        return speechToText;
      } catch (error) {
        console.error('Error saving speech to text:', error);
        throw new Error('Error saving speech to text');
      }
    }),
});
