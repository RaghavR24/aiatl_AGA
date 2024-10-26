import { extractTodos, TodoItem } from '@/lib/todoExtractor';
import { PrismaClient, Prisma } from '@prisma/client'
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

// Initialize PrismaClient outside of the function
const prisma = new PrismaClient();

// Define the SavedTodoItem type based on the Prisma schema
type SavedTodoItem = {
  id: string;
  userId: string;
  text: string;
  priority: number;
  isSubtask: boolean;
  createdAt: Date;
  updatedAt: Date;
  subtasks: SavedTodoItem[];
};

async function saveTodosToDatabase(todos: TodoItem[], userId: string): Promise<SavedTodoItem[]> {
  const savedTodos: SavedTodoItem[] = [];

  if (!todos || todos.length === 0) {
    console.log('No todos to save');
    return savedTodos;
  }

  for (const todo of todos) {
    console.log('Saving todo:', todo);
    try {
      const savedTodo = await prisma.todo.create({
        data: {
          userId,
          text: todo.text,
          priority: todo.priority,
          isSubtask: false,
          subtasks: {
            create: todo.subtasks && Array.isArray(todo.subtasks) && todo.subtasks.length > 0
              ? todo.subtasks.map((subtask: TodoItem) => ({
                  userId,
                  text: subtask.text,
                  priority: subtask.priority,
                  isSubtask: true,
                }))
              : undefined,
          },
        },
        include: {
          subtasks: true,
        },
      });
      savedTodos.push(savedTodo as SavedTodoItem);
    } catch (error) {
      console.error('Error saving todo:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
    }
  }

  return savedTodos;
}

export const todoRouter = createTRPCRouter({
  extractTodos: protectedProcedure
    .input(z.object({ text: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { text } = input;
      const userId = ctx.session.user.id;

      if (!text) {
        throw new Error('Text is required');
      }

      try {
        const todos = await extractTodos(text);
        const savedTodos = await saveTodosToDatabase(todos, userId);
        return savedTodos;
      } catch (error) {
        console.error('Error extracting todos:', error);
        throw new Error('Error extracting todos');
      }
    }),

  // New procedure for extracting and saving todos
  extractAndSaveTodos: protectedProcedure
    .input(z.object({ text: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { text } = input;
      const userId = ctx.session.user.id;

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

        console.log('Calling saveTodosToDatabase function');
        const savedTodos = await saveTodosToDatabase(todos, userId);
        console.log('Saved todos:', JSON.stringify(savedTodos, null, 2));

        const formattedTodos = savedTodos.map(todo => ({
          id: todo.id,
          text: todo.text,
          priority: todo.priority,
          subtasks: todo.subtasks?.map((subtask: { id: string; text: string; priority: number; isSubtask: boolean }) => ({
            id: subtask.id,
            text: subtask.text,
            priority: subtask.priority,
            isSubtask: subtask.isSubtask,
          })) ?? [],
          isExpanded: false,
        }));
        console.log('Formatted todos:', JSON.stringify(formattedTodos, null, 2));

        return formattedTodos;
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
