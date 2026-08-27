import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { validateRequest } from '../../shared/utils/validateRequest.js';
import { authenticateJWT } from '../../middleware/auth.js';
import * as cartController from './controller.js';
import { addToCartSchema, cartItemParamSchema, updateCartItemSchema } from './validation.js';

const router = Router();

router.use(asyncHandler(authenticateJWT));

router.get('/', asyncHandler(cartController.getCartHandler));

router.post(
  '/items',
  validateRequest(addToCartSchema, 'body'),
  asyncHandler(cartController.addToCartHandler),
);

router.patch(
  '/items/:cartItemId',
  validateRequest(cartItemParamSchema, 'params'),
  validateRequest(updateCartItemSchema, 'body'),
  asyncHandler(cartController.updateCartItemHandler),
);

router.delete(
  '/items/:cartItemId',
  validateRequest(cartItemParamSchema, 'params'),
  asyncHandler(cartController.removeCartItemHandler),
);

router.delete('/', asyncHandler(cartController.clearCartHandler));

export default router;
