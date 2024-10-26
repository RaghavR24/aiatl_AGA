import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { extractTodos, TodoItem } from '@/lib/todoExtractor';

export const getTodoRouter = createTRPCRouter({
  getUserTodos: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.session.user.id;
      const todos = await ctx.db.todo.findMany({
        where: {
          userId: userId,
          isSubtask: false, // Only fetch top-level tasks
        },
        include: {
          subtasks: {
            include: {
              subtasks: true, // Include nested subtasks
            },
          },
        },
        orderBy: {
          priority: 'asc',
        },
      });
      return todos;
    }),

  createTodo: protectedProcedure
    .input(z.object({
      text: z.string(),
      priority: z.number(),
      parentId: z.string().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { text, priority, parentId } = input;
      const userId = ctx.session.user.id;
      return ctx.db.todo.create({
        data: {
          text,
          priority,
          userId,
          parentId,
          isSubtask: !!parentId,
        },
      });
    }),

  deleteTodo: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { id } = input;
      const userId = ctx.session.user.id;

      // First, delete all subtasks
      await ctx.db.todo.deleteMany({
        where: {
          parentId: id,
          userId: userId,
        },
      });

      // Then delete the task itself
      return ctx.db.todo.delete({
        where: {
          id: id,
          userId: userId,
        },
      });
    }),

  extractAndSaveTodos: protectedProcedure
    .input(z.object({ text: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { text } = input;

      console.log('Starting extractAndSaveTodos procedure');
      console.log('Input text:', text);
      console.log('User ID:', userId);

      if (!text) {
        console.error('Text is empty');
        throw new Error('Text is required');
      }

      try {
        console.log('Calling extractTodos function');
        const todos = await extractTodos(text);
        console.log('Extracted todos:', JSON.stringify(todos, null, 2));

        console.log('Saving todos to database');
        const savedTodos = await saveTodosToDatabase(todos, userId, ctx.db);
        console.log('Saved todos:', JSON.stringify(savedTodos, null, 2));

        return savedTodos;
      } catch (error) {
        console.error('Error in extractAndSaveTodos:', error);
        if (error instanceof Error) {
          console.error('Error message:', error.message);
          console.error('Error stack:', error.stack);
        }
        throw new Error('Error extracting and saving todos');
      }
    }),
});

async function saveTodosToDatabase(todos: TodoItem[], userId: string, db: any) {
  const savedTodos = [];

  for (const todo of todos) {
    const savedTodo = await db.todo.create({
      data: {
        text: todo.text,
        priority: todo.priority,
        userId,
        isSubtask: false,
        subtasks: {
          create: todo.subtasks?.map((subtask: TodoItem) => ({
            text: subtask.text,
            priority: subtask.priority,
            userId,
            isSubtask: true,
          })) ?? [],
        },
      },
      include: {
        subtasks: true,
      },
    });
    savedTodos.push(savedTodo);
  }

  return savedTodos;
}
