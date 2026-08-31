import express from 'express';
import cors from 'cors';
import { catalogRouter } from './catalog/catalog.routes.js';
import { notFoundHandler, errorHandler } from './common/middleware/error-handler.js';

export const app = express();

app.use(cors());
app.use(express.json());

app.use('/catalog', catalogRouter);

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use(notFoundHandler);
app.use(errorHandler);