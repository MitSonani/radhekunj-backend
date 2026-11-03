import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { validateRequest } from '../../shared/utils/validateRequest.js';
import * as inventoryController from './controller.js';
import {
  inventoryListQuerySchema,
  movementsQuerySchema,
  stockAdjustmentSchema,
  updateInventorySettingsSchema,
  updateThresholdSchema,
  variantIdParamSchema,
} from './validation.js';

const router = Router();

/**
 * GET /admin/inventory/dashboard
 * Aggregated inventory metrics, low-stock counts, out-of-stock counts, valuation, and recent movements.
 */
router.get('/dashboard', asyncHandler(inventoryController.getDashboardHandler));

/**
 * GET /admin/inventory/settings
 * Retrieves store-wide inventory configuration.
 */
router.get('/settings', asyncHandler(inventoryController.getSettingsHandler));

/**
 * PATCH /admin/inventory/settings
 * Updates store-wide inventory configuration (e.g. default low stock threshold).
 */
router.patch(
  '/settings',
  validateRequest(updateInventorySettingsSchema, 'body'),
  asyncHandler(inventoryController.updateSettingsHandler),
);

/**
 * GET /admin/inventory/movements
 * Returns paginated, searchable, and filtered stock movement audit logs.
 */
router.get(
  '/movements',
  validateRequest(movementsQuerySchema, 'query'),
  asyncHandler(inventoryController.listMovementsHandler),
);

/**
 * GET /admin/inventory
 * Returns paginated, searchable, and filtered product variant inventory list.
 */
router.get(
  '/',
  validateRequest(inventoryListQuerySchema, 'query'),
  asyncHandler(inventoryController.listInventoryHandler),
);

/**
 * GET /admin/inventory/:variantId
 * Returns inventory details and movement history for a specific variant.
 */
router.get(
  '/:variantId',
  validateRequest(variantIdParamSchema, 'params'),
  asyncHandler(inventoryController.getVariantInventoryHandler),
);

/**
 * POST /admin/inventory/:variantId/adjust
 * Performs manual stock adjustment (ADD, REMOVE, SET, CORRECTION) with required reason and audit log.
 */
router.post(
  '/:variantId/adjust',
  validateRequest(variantIdParamSchema, 'params'),
  validateRequest(stockAdjustmentSchema, 'body'),
  asyncHandler(inventoryController.adjustStockHandler),
);

/**
 * PATCH /admin/inventory/:variantId/threshold
 * Configures the low-stock threshold for an individual product variant.
 */
router.patch(
  '/:variantId/threshold',
  validateRequest(variantIdParamSchema, 'params'),
  validateRequest(updateThresholdSchema, 'body'),
  asyncHandler(inventoryController.updateThresholdHandler),
);

export default router;
