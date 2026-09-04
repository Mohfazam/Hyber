import { GoogleGenAI } from '@google/genai';
import { db, sessions } from '@repo/db';
import { eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { SYSTEM_PROMPT } from './agent.prompts.js';
import { agentToolDeclarations, executeTool } from './agent.tools.js';
import { NotFoundError } from '../common/errors.js';
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
const MODEL = env.GEMINI_MODEL; // now configurable via .env, no more hunting through source on deprecation
const MAX_TOOL_ITERATIONS = 5;
async function loadHistory(sessionId) {
    const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    if (!row) {
        throw new NotFoundError(`No session found with id "${sessionId}"`);
    }
    return row.conversationHistory ?? [];
}
async function saveHistory(sessionId, history) {
    await db
        .update(sessions)
        .set({ conversationHistory: history, updatedAt: new Date() })
        .where(eq(sessions.id, sessionId));
}
export async function createSession(userId) {
    const [row] = await db
        .insert(sessions)
        .values({ userId, conversationHistory: [] })
        .returning({ id: sessions.id });
    return { sessionId: row.id };
}
export async function sendMessage(sessionId, userMessage) {
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
    let paymentOrder;
    const selectedProducts = [];
    while (response.functionCalls && response.functionCalls.length > 0) {
        if (++iterations > MAX_TOOL_ITERATIONS) {
            throw new Error('Agent exceeded max tool-call iterations � possible loop.');
        }
        const responseParts = [];
        for (const call of response.functionCalls) {
            const result = await executeTool(call.name, call.args ?? {}, sessionId);
            if (call.name === 'search_catalog' && Array.isArray(result)) {
                selectedProducts.push(...result);
            }
            else if (call.name === 'get_product_details' && result && typeof result === 'object') {
                selectedProducts.push(result);
            }
            if (typeof result === 'object' && result !== null && 'paymentOrder' in result) {
                const candidate = result.paymentOrder;
                if (typeof candidate === 'object' && candidate !== null && 'id' in candidate) {
                    paymentOrder = candidate;
                }
            }
            responseParts.push({
                functionResponse: {
                    id: call.id,
                    name: call.name,
                    response: { output: result },
                },
            });
        }
        response = await chat.sendMessage({ message: responseParts });
    }
    const finalText = response.text ?? '';
    const updatedHistory = chat.getHistory();
    await saveHistory(sessionId, updatedHistory);
    return { reply: finalText, paymentOrder, selectedProducts };
}
