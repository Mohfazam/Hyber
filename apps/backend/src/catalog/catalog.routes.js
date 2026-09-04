import { Router } from 'express';
import * as catalogController from './catalog.controller.js';
export const catalogRouter = Router();
catalogRouter.get('/schema', catalogController.getCatalogSchema);
catalogRouter.get('/products', catalogController.searchProducts);
catalogRouter.get('/products/:sku', catalogController.getProductBySku);
catalogRouter.get('/products/:sku/availability', catalogController.getProductAvailability);
