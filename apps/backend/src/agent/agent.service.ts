import { GoogleGenAI, type Content, type Part } from '@google/genai';
import { db, sessions } from '@repo/db';
import { eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { SYSTEM_PROMPT } from './agent.prompts.js';
import { agentToolDeclarations, executeTool } from './agent.tools.js';
import { NotFoundError } from '../common/errors.js';

/**
 * Why this file exists:
 * This is the core reasoning loop � the only place that talks to Gemini.
 * Sessions are stateless from HTTP's point of view (each request is a
 * separate call), so we reconstruct conversation history from the DB on
 * every turn, hand it to Gemini, run the tool-calling loop until Gemini
 * produces a final text answer (no more function calls pending), then
 * persist the updated history back to the DB.
 *
 * MODEL CHOICE: gemini-2.5-flash is used here for low latency, which
 * matters a lot once this sits behind a live voice conversation � swap to
 * a heavier model only if response quality genuinely requires it.
 */

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
const MODEL = 'gemini-3.5-flash-lite';
const MAX_TOOL_ITERATIONS = 5; // safety cap � never loop forever on tool calls

async function loadHistory(sessionId: string): Promise<Content[]> {
  const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);

  if (!row) {
    throw new NotFoundError(`No session found with id "${sessionId}"`);
  }

  return (row.conversationHistory as unknown as Content[]) ?? [];
}

async function saveHistory(sessionId: string, history: Content[]): Promise<void> {
  await db
    .update(sessions)
    .set({ conversationHistory: history as any, updatedAt: new Date() })
    .where(eq(sessions.id, sessionId));
}

export async function createSession(userId?: string): Promise<{ sessionId: string }> {
  const [row] = await db
    .insert(sessions)
    .values({ userId, conversationHistory: [] })
    .returning({ id: sessions.id });

  return { sessionId: row!.id };
}

/**
 * Sends one user message through the full tool-calling loop and returns
 * the agent's final text reply. This is the single entry point the
 * controller (and later, the voice pipeline) calls.
 */
export async function sendMessage(sessionId: string, userMessage: string): Promise<string> {
  const history = await loadHistory(sessionId);

  const chat = ai.chats.create({
    model: MODEL,
    history,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ functionDeclarations: agentToolDeclarations }],
    },
  });

  let response = await chat.sendMessage({ message: userMessage });
  let iterations = 0;

  // Tool-calling loop: keep executing tools and feeding results back until
  // Gemini responds with plain text (no more function calls requested).
  while (response.functionCalls && response.functionCalls.length > 0) {
    if (++iterations > MAX_TOOL_ITERATIONS) {
      throw new Error('Agent exceeded max tool-call iterations � possible loop.');
    }

    const responseParts: Part[] = [];

    for (const call of response.functionCalls) {
      const result = await executeTool(call.name!, call.args ?? {});

      responseParts.push({
        functionResponse: {
          name: call.name!,
          response: { result },
        },
      });
    }

    response = await chat.sendMessage({ message: responseParts });
  }

  const finalText = response.text ?? '';

  // Persist the full updated history (Gemini's chat object tracks it internally;
  // .getHistory() gives us the canonical list including tool calls/results).
  const updatedHistory = chat.getHistory();
  await saveHistory(sessionId, updatedHistory);

  return finalText;
}
