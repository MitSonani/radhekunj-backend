import { Router } from 'express';
import { validateRequest } from '../../shared/utils/validateRequest.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import * as categoryController from './controller.js';
import {
  createCategorySchema,
  updateCategorySchema,
  categoryIdParamSchema,
  listCategoriesQuerySchema,
  uploadUrlSchema,
} from './validation.js';

const router = Router();

router.post(
  '/',
  validateRequest(createCategorySchema, 'body'),
  asyncHandler(categoryController.createCategoryHandler),
);

router.get(
  '/',
  validateRequest(listCategoriesQuerySchema, 'query'),
  asyncHandler(categoryController.listCategoriesHandler),
);

router.post(
  '/image/upload-url',
  validateRequest(uploadUrlSchema, 'body'),
  asyncHandler(categoryController.createImageUploadUrlHandler),
);

router.get(
  '/:id',
  validateRequest(categoryIdParamSchema, 'params'),
  asyncHandler(categoryController.getCategoryByIdHandler),
);

router.patch(
  '/:id',
  validateRequest(categoryIdParamSchema, 'params'),
  validateRequest(updateCategorySchema, 'body'),
  asyncHandler(categoryController.updateCategoryHandler),
);

router.delete(
  '/:id',
  validateRequest(categoryIdParamSchema, 'params'),
  asyncHandler(categoryController.deleteCategoryHandler),
);

export default router;
