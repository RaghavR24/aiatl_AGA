// server/api/mindMapRouter.ts

import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

// Initialize PrismaClient
const prisma = new PrismaClient();

interface MindMapNode {
  id: string;
  name: string;
  type: 'main' | 'subtopic';
  infoPoints: string[];
}

interface MindMapEdge {
  sourceId: string;
  targetId: string;
}

async function fetchMindMapData(userId: string) {
  // Fetch nodes and edges from the Prisma database
  const nodes = await prisma.mindMapNode.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      type: true,
      infoPoints: true,
    },
  });

  const edges = await prisma.mindMapEdge.findMany({
    where: { userId },
    select: {
      sourceId: true,
      targetId: true,
    },
  });

  return { nodes, edges };
}

export const mindMapRouter = createTRPCRouter({
  getMindMap: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input, ctx }) => {
      const { userId } = input;

      // Ensure that the user requesting data matches the session user ID
      if (userId !== ctx.session.user.id) {
        throw new Error('Unauthorized access');
      }

      try {
        const { nodes, edges } = await fetchMindMapData(userId);
        return { nodes, edges };
      } catch (error) {
        console.error('Error fetching mind map data:', error);
        throw new Error('Error fetching mind map data');
      }
    }),
});
