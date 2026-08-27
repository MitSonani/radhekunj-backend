import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { validateRequest } from '../../shared/utils/validateRequest.js';
import { authenticateJWT } from '../../middleware/auth.js';
import * as wishlistController from './controller.js';
import { addToWishlistSchema, wishlistProductParamSchema } from './validation.js';

const router = Router();

router.use(asyncHandler(authenticateJWT));

/**
 * GET /wishlist
 * Returns the authenticated user's wishlist.
 * Inactive products are excluded from the response without deleting DB records.
 */
router.get('/', asyncHandler(wishlistController.getWishlistHandler));

/**
 * POST /wishlist
 * Adds a product to the authenticated user's wishlist.
 * Idempotent: adding an already-wishlisted product returns 200 without creating a duplicate.
 */
router.post(
  '/',
  validateRequest(addToWishlistSchema, 'body'),
  asyncHandler(wishlistController.addToWishlistHandler),
);

/**
 * DELETE /wishlist/:productId
 * Removes a product from the authenticated user's wishlist.
 * Returns 404 when the item does not exist.
 */
router.delete(
  '/:productId',
  validateRequest(wishlistProductParamSchema, 'params'),
  asyncHandler(wishlistController.removeFromWishlistHandler),
);

/**
 * GET /wishlist/:productId/check
 * Checks whether the authenticated user has wishlisted the given product.
 * Allows the User Panel product page to show a "Remove from Wishlist" button
 * without fetching the full wishlist.
 */
router.get(
  '/:productId/check',
  validateRequest(wishlistProductParamSchema, 'params'),
  asyncHandler(wishlistController.checkWishlistStatusHandler),
);

export default router;
