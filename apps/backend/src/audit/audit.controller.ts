import type { Request, Response } from 'express';
import { z } from 'zod';
import * as auditService from './audit.service.js';

const sessionParamSchema = z.object({
  sessionId: z.string().uuid(),
});

export async function getSessionTrail(req: Request, res: Response): Promise<void> {
  const { sessionId } = sessionParamSchema.parse(req.params);
  const trail = await auditService.getAuditTrail(sessionId);
  res.status(200).json({ data: trail });
}

export async function getRecentActivity(req: Request, res: Response): Promise<void> {
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const activity = await auditService.getRecentActivity(limit);
  res.status(200).json({ data: activity });
}
