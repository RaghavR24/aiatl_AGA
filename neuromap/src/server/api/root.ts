import { postRouter } from "~/server/api/routers/post";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { userRouter } from "./routers/user";
import { speechRouter } from './routers/speechtotext'
import { getTodoRouter } from './routers/todoRouter'
import { transcriptionRouter } from './routers/transcribeAudio'
import { mindchatRouter } from "./routers/mindchat";
import { pineconeRouter } from "~/server/api/routers/pinecone";
import {mindMapRouter} from "~/server/api/routers/mindMap";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
  user: userRouter,
  speech: speechRouter,
  todo: getTodoRouter,
  transcription: transcriptionRouter,
  mindchat: mindchatRouter,
  pinecone: pineconeRouter,
  mindMap: mindMapRouter
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
