import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { validateRequest } from '../../shared/utils/validateRequest.js';
import { authenticateJWT } from '../../middleware/auth.js';
import * as paymentController from './controller.js';
import {
  createRazorpayOrderSchema,
  verifyRazorpayPaymentSchema,
  orderIdParamSchema,
} from './validation.js';

const router = Router();

/**
 * Public Webhook: POST /payments/razorpay/webhook
 */
router.post(
  '/razorpay/webhook',
  asyncHandler(paymentController.razorpayWebhookHandler),
);

// Authenticated routes
router.use(asyncHandler(authenticateJWT));

/**
 * POST /payments/razorpay/order
 * Creates a Razorpay order attempt for an order.
 */
router.post(
  '/razorpay/order',
  validateRequest(createRazorpayOrderSchema, 'body'),
  asyncHandler(paymentController.createRazorpayOrderHandler),
);

/**
 * POST /payments/razorpay/verify
 * Cryptographically verifies Razorpay payment signature.
 */
router.post(
  '/razorpay/verify',
  validateRequest(verifyRazorpayPaymentSchema, 'body'),
  asyncHandler(paymentController.verifyRazorpayPaymentHandler),
);

/**
 * GET /payments/order/:orderId
 * Returns payments associated with an order.
 */
router.get(
  '/order/:orderId',
  validateRequest(orderIdParamSchema, 'params'),
  asyncHandler(paymentController.getPaymentsForOrderHandler),
);

export default router;
