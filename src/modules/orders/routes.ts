import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { validateRequest } from '../../shared/utils/validateRequest.js';
import { authenticateJWT } from '../../middleware/auth.js';
import * as orderController from './controller.js';
import {
  placeOrderSchema,
  orderIdParamSchema,
  orderPaginationQuerySchema,
} from './validation.js';

const router = Router();

// Public check for COD eligibility (accessible to guests and authenticated users)
router.get('/cod-eligibility', asyncHandler(orderController.getCodEligibilityHandler));

router.use(asyncHandler(authenticateJWT));

/**
 * POST /orders/checkout
 * Creates an order from the authenticated user's current active cart.
 */
router.post(
  '/checkout',
  validateRequest(placeOrderSchema, 'body'),
  asyncHandler(orderController.placeOrderHandler),
);

/**
 * GET /orders
 * Returns a paginated list of orders placed by the authenticated user.
 */
router.get(
  '/',
  validateRequest(orderPaginationQuerySchema, 'query'),
  asyncHandler(orderController.getUserOrdersHandler),
);

/**
 * GET /orders/:id
 * Returns order details for a specific order owned by the authenticated user.
 */
router.get(
  '/:id',
  validateRequest(orderIdParamSchema, 'params'),
  asyncHandler(orderController.getUserOrderByIdHandler),
);

export default router;
