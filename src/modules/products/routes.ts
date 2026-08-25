import { Router } from 'express';
import { validateRequest } from '../../shared/utils/validateRequest.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import * as productController from './controller.js';
import {
  createProductSchema,
  updateProductSchema,
  productIdParamSchema,
  productVariantParamsSchema,
  productImageParamsSchema,
  listProductsQuerySchema,
  createVariantSchema,
  updateVariantSchema,
  setInventorySchema,
  adjustInventorySchema,
  createProductImageSchema,
  updateProductImageSchema,
  productImageUploadUrlSchema,
} from './validation.js';

const router = Router();

router.post(
  '/',
  validateRequest(createProductSchema, 'body'),
  asyncHandler(productController.createProductHandler),
);

router.get(
  '/',
  validateRequest(listProductsQuerySchema, 'query'),
  asyncHandler(productController.listProductsHandler),
);

router.get(
  '/:id',
  validateRequest(productIdParamSchema, 'params'),
  asyncHandler(productController.getProductByIdHandler),
);

router.patch(
  '/:id',
  validateRequest(productIdParamSchema, 'params'),
  validateRequest(updateProductSchema, 'body'),
  asyncHandler(productController.updateProductHandler),
);

router.delete(
  '/:id',
  validateRequest(productIdParamSchema, 'params'),
  asyncHandler(productController.deactivateProductHandler),
);

router.post(
  '/:id/variants',
  validateRequest(productIdParamSchema, 'params'),
  validateRequest(createVariantSchema, 'body'),
  asyncHandler(productController.createVariantHandler),
);

router.patch(
  '/:id/variants/:variantId',
  validateRequest(productVariantParamsSchema, 'params'),
  validateRequest(updateVariantSchema, 'body'),
  asyncHandler(productController.updateVariantHandler),
);

router.delete(
  '/:id/variants/:variantId',
  validateRequest(productVariantParamsSchema, 'params'),
  asyncHandler(productController.deactivateVariantHandler),
);

router.patch(
  '/:id/variants/:variantId/inventory',
  validateRequest(productVariantParamsSchema, 'params'),
  validateRequest(setInventorySchema, 'body'),
  asyncHandler(productController.setInventoryHandler),
);

router.post(
  '/:id/variants/:variantId/inventory/adjust',
  validateRequest(productVariantParamsSchema, 'params'),
  validateRequest(adjustInventorySchema, 'body'),
  asyncHandler(productController.adjustInventoryHandler),
);

router.post(
  '/:id/images/upload-url',
  validateRequest(productIdParamSchema, 'params'),
  validateRequest(productImageUploadUrlSchema, 'body'),
  asyncHandler(productController.createImageUploadUrlHandler),
);

router.post(
  '/:id/images',
  validateRequest(productIdParamSchema, 'params'),
  validateRequest(createProductImageSchema, 'body'),
  asyncHandler(productController.createProductImageHandler),
);

router.patch(
  '/:id/images/:imageId',
  validateRequest(productImageParamsSchema, 'params'),
  validateRequest(updateProductImageSchema, 'body'),
  asyncHandler(productController.updateProductImageHandler),
);

router.delete(
  '/:id/images/:imageId',
  validateRequest(productImageParamsSchema, 'params'),
  asyncHandler(productController.deleteProductImageHandler),
);

export default router;
