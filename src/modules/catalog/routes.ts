import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { validateRequest } from '../../shared/utils/validateRequest.js';
import * as catalogController from './controller.js';
import { listPublicProductsQuerySchema, publicProductSlugParamSchema } from './validation.js';

const router = Router();

router.get('/filters', asyncHandler(catalogController.getFilterOptionsHandler));

router.get(
  '/',
  validateRequest(listPublicProductsQuerySchema, 'query'),
  asyncHandler(catalogController.listPublicProductsHandler),
);

router.get(
  '/:slug',
  validateRequest(publicProductSlugParamSchema, 'params'),
  asyncHandler(catalogController.getPublicProductBySlugHandler),
);

export default router;
