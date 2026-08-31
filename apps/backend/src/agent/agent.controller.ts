import type { Request, Response } from 'express';
import { createSessionBodySchema, sendMessageBodySchema } from './agent.validators.js';
import * as agentService from './agent.service.js';

export async function createSession(req: Request, res: Response): Promise<void> {
  const { userId } = createSessionBodySchema.parse(req.body);

  const result = await agentService.createSession(userId);

  res.status(201).json({ data: result });
}

export async function sendMessage(req: Request, res: Response): Promise<void> {
  const { sessionId, message } = sendMessageBodySchema.parse(req.body);

  const reply = await agentService.sendMessage(sessionId, message);

  res.status(200).json({ data: { reply } });
}
