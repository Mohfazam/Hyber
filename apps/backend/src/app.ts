import express from 'express';
import cors from 'cors';
import { catalogRouter } from './catalog/catalog.routes.js';
import { agentRouter } from './agent/agent.routes.js';
import { auditRouter } from './audit/audit.routes.js';
import { notFoundHandler, errorHandler } from './common/middleware/error-handler.js';

/**
 * UPDATED — added the audit router mount. Replace the full contents of
 * src/app.ts with this.
 */

export const app = express();

app.use(cors());
app.use(express.json());

app.use('/catalog', catalogRouter);
app.use('/agent', agentRouter);
app.use('/audit', auditRouter);

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use(notFoundHandler);
app.use(errorHandler);
