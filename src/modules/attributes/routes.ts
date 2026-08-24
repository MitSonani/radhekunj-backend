import { Router } from 'express';
import { validateRequest } from '../../shared/utils/validateRequest.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import * as attributeController from './controller.js';
import {
  createAttributeSchema,
  updateAttributeSchema,
  attributeIdParamSchema,
  attributeValueParamsSchema,
  listAttributesQuerySchema,
  listAttributeValuesQuerySchema,
  createAttributeValueSchema,
  updateAttributeValueSchema,
} from './validation.js';

const router = Router();

router.post(
  '/',
  validateRequest(createAttributeSchema, 'body'),
  asyncHandler(attributeController.createAttributeHandler),
);

router.get(
  '/',
  validateRequest(listAttributesQuerySchema, 'query'),
  asyncHandler(attributeController.listAttributesHandler),
);

router.get(
  '/:id/values',
  validateRequest(attributeIdParamSchema, 'params'),
  validateRequest(listAttributeValuesQuerySchema, 'query'),
  asyncHandler(attributeController.listAttributeValuesHandler),
);

router.post(
  '/:id/values',
  validateRequest(attributeIdParamSchema, 'params'),
  validateRequest(createAttributeValueSchema, 'body'),
  asyncHandler(attributeController.createAttributeValueHandler),
);

router.patch(
  '/:id/values/:valueId',
  validateRequest(attributeValueParamsSchema, 'params'),
  validateRequest(updateAttributeValueSchema, 'body'),
  asyncHandler(attributeController.updateAttributeValueHandler),
);

router.delete(
  '/:id/values/:valueId',
  validateRequest(attributeValueParamsSchema, 'params'),
  asyncHandler(attributeController.deleteAttributeValueHandler),
);

router.get(
  '/:id',
  validateRequest(attributeIdParamSchema, 'params'),
  asyncHandler(attributeController.getAttributeByIdHandler),
);

router.patch(
  '/:id',
  validateRequest(attributeIdParamSchema, 'params'),
  validateRequest(updateAttributeSchema, 'body'),
  asyncHandler(attributeController.updateAttributeHandler),
);

router.delete(
  '/:id',
  validateRequest(attributeIdParamSchema, 'params'),
  asyncHandler(attributeController.deleteAttributeHandler),
);

export default router;
