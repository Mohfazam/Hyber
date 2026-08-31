import { GoogleGenAI, type Content, type Part } from '@google/genai';
import { db, sessions } from '@repo/db';
import { eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { SYSTEM_PROMPT } from './agent.prompts.js';
import { agentToolDeclarations, executeTool } from './agent.tools.js';
import { NotFoundError } from '../common/errors.js';

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
const MODEL = env.GEMINI_MODEL; // now configurable via .env, no more hunting through source on deprecation
const MAX_TOOL_ITERATIONS = 5;

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

  while (response.functionCalls && response.functionCalls.length > 0) {
    if (++iterations > MAX_TOOL_ITERATIONS) {
      throw new Error('Agent exceeded max tool-call iterations � possible loop.');
    }

    const responseParts: Part[] = [];

    for (const call of response.functionCalls) {
      const result = await executeTool(call.name!, call.args ?? {}, sessionId);

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

  const updatedHistory = chat.getHistory();
  await saveHistory(sessionId, updatedHistory);

  return finalText;
}
