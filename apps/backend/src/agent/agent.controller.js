import { createSessionBodySchema, sendMessageBodySchema } from './agent.validators.js';
import * as agentService from './agent.service.js';
export async function createSession(req, res) {
    const { userId } = createSessionBodySchema.parse(req.body);
    const result = await agentService.createSession(userId);
    res.status(201).json({ data: result });
}
export async function sendMessage(req, res) {
    const { sessionId, message } = sendMessageBodySchema.parse(req.body);
    const result = await agentService.sendMessage(sessionId, message);
    res.status(200).json({ data: result });
}
