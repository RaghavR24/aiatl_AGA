import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const userRouter = createTRPCRouter({
  updateUserInfo: protectedProcedure
    .input(z.object({
      name: z.string().optional(),
      // Add other fields you want to update
    }))
    .mutation(async ({ ctx, input }) => {
      const updatedUser = await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: {
          name: input.name,
          // Update other fields as needed
        },
      });
      return updatedUser;
    }),
});
