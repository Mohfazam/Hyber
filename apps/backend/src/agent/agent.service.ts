import { GoogleGenAI, type Content, type Part } from '@google/genai';
import { db, sessions } from '@repo/db';
import { eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { SYSTEM_PROMPT } from './agent.prompts.js';
import { agentToolDeclarations, executeTool } from './agent.tools.js';
import { generateTTS } from './agent.tts.js';
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

export async function sendMessage(sessionId: string, userMessage: string): Promise<{
  reply: string;
  paymentOrder?: { id: string; amount: number; currency: string };
  selectedProducts?: unknown[];
  audio?: string | null;
}> {
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
  let loopNotice: string | null = null;
  const seenToolCalls = new Set<string>();
  let paymentOrder: { id: string; amount: number; currency: string } | undefined;
  const selectedProducts: unknown[] = [];

  while (response.functionCalls && response.functionCalls.length > 0) {
    if (++iterations > MAX_TOOL_ITERATIONS) {
      loopNotice =
        'I could not complete that request safely. Please rephrase it or ask about one specific product.';
      break;
    }

    const responseParts: Part[] = [];

    for (const call of response.functionCalls) {
      const callKey = `${call.name}:${JSON.stringify(call.args ?? {})}`;
      if (seenToolCalls.has(callKey)) {
        loopNotice =
          'I got stuck repeating the same lookup. Please ask about one specific product and I will try again.';
        break;
      }
      seenToolCalls.add(callKey);

      const result = await executeTool(call.name!, call.args ?? {}, sessionId);

      if (call.name === 'search_catalog' && Array.isArray(result)) {
        selectedProducts.push(...result);
      } else if (call.name === 'get_product_details' && result && typeof result === 'object') {
        selectedProducts.push(result);
      }

      if (typeof result === 'object' && result !== null && 'paymentOrder' in result) {
        const candidate = (result as { paymentOrder?: unknown }).paymentOrder;
        if (typeof candidate === 'object' && candidate !== null && 'id' in candidate) {
          paymentOrder = candidate as { id: string; amount: number; currency: string };
        }
      }

      responseParts.push({
        functionResponse: {
          id: call.id,
          name: call.name!,
          response: { output: result },
        },
      });
    }

    if (loopNotice) break;

    response = await chat.sendMessage({ message: responseParts });
  }

  const finalText = loopNotice ?? response.text ?? '';

  const updatedHistory = chat.getHistory();
  await saveHistory(sessionId, updatedHistory);

  let audio: string | null = null;
  if (finalText) {
    audio = await generateTTS(finalText);
  }

  return { reply: finalText, paymentOrder, selectedProducts, audio };
}
