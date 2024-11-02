import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { LLMChain } from "langchain/chains";

export type TodoItem = {
  text: string;
  priority: number;
  subtasks: TodoItem[];
};

const TODO_EXTRACTOR_TEMPLATE = `
Analyze the following text and extract any tasks, action items, or things the user needs to do later or be reminded of. Consider various formats and implicit tasks. Format the output as a JSON array of objects, where each object has the following properties:
- text: The task description
- priority: A number from 1 to 10, where 1 is high priority and 10 is low priority
- subtasks: An array of subtasks, each following the same format as the main tasks

Look for:
1. Explicit todo items (e.g., "TODO:", "Task:", "Action item:")
2. Implicit tasks or future actions (e.g., "I need to", "Don't forget to", "Remember to")
3. Deadlines or time-sensitive items (e.g., "by Friday", "next week")
4. Questions or uncertainties that require follow-up
5. Commitments or promises made in the text

Text: {text}

JSON Output:
`;

export async function extractTodos(text: string): Promise<TodoItem[]> {
  const model = new ChatOpenAI({ modelName: "gpt-3.5-turbo" });
  const prompt = new PromptTemplate({
    template: TODO_EXTRACTOR_TEMPLATE,
    inputVariables: ["text"],
  });

  const chain = new LLMChain({ llm: model, prompt });
  const result = await chain.call({ text });

  try {
    if (typeof result.text !== 'string') {
      throw new Error('Unexpected result type');
    }
    // Remove markdown code block formatting
    const cleanedResult = result.text.replace(/```json\n|\n```/g, '').trim();
    const todos = JSON.parse(cleanedResult) as TodoItem[];
    if (!Array.isArray(todos)) {
      throw new Error('Parsed result is not an array');
    }
    return processTodos(todos);
  } catch (error) {
    console.error("Error parsing LLM output:", error);
    return [];
  }
}

function processTodos(todos: TodoItem[]): TodoItem[] {
  return todos.map(todo => ({
    ...todo,
    text: todo.text.replace(/^(TODO|Task|Action item):\s*/i, '').trim(),
    priority: todo.priority || inferPriority(todo.text),
    subtasks: processTodos(todo.subtasks || [])
  }));
}

function inferPriority(text: string): number {
  const urgentKeywords = ['urgent', 'critical', 'immediate', 'asap'];
  const highKeywords = ['important', 'priority', 'crucial'];
  const mediumKeywords = ['should', 'need to', 'required'];
  const lowKeywords = ['maybe', 'consider', 'might', 'could', 'eventually'];

  text = text.toLowerCase();

  if (urgentKeywords.some(keyword => text.includes(keyword))) {
    return Math.floor(Math.random() * 2) + 1; // Returns 1-2
  } else if (highKeywords.some(keyword => text.includes(keyword))) {
    return Math.floor(Math.random() * 2) + 3; // Returns 3-4
  } else if (mediumKeywords.some(keyword => text.includes(keyword))) {
    return Math.floor(Math.random() * 3) + 5; // Returns 5-7
  } else if (lowKeywords.some(keyword => text.includes(keyword))) {
    return Math.floor(Math.random() * 3) + 8; // Returns 8-10
  }

  return Math.floor(Math.random() * 4) + 4; // Returns 4-7 as default
}

// ... rest of the file ...
