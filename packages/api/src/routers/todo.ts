import z from "zod";

import {
  createTodo,
  deleteTodo,
  getTodos,
  toggleTodo,
} from "../programs/todo";
import { runForTransport } from "../effect-runner";
import { publicProcedure } from "../index";

export const todoRouter = {
  getAll: publicProcedure.handler(({ context }) =>
    runForTransport(context.runEffect, getTodos),
  ),

  create: publicProcedure
    .input(z.object({ text: z.string().min(1) }))
    .handler(({ context, input }) =>
      runForTransport(context.runEffect, createTodo(input)),
    ),

  toggle: publicProcedure
    .input(z.object({ id: z.number(), completed: z.boolean() }))
    .handler(({ context, input }) =>
      runForTransport(context.runEffect, toggleTodo(input)),
    ),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .handler(({ context, input }) =>
      runForTransport(context.runEffect, deleteTodo(input)),
    ),
};
