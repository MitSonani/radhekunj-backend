import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { validateRequest } from '../../shared/utils/validateRequest.js';
import { authenticateJWT } from '../../middleware/auth.js';
import * as addressController from './controller.js';
import { addressIdParamSchema, createAddressSchema, updateAddressSchema } from './validation.js';

const router = Router();

router.use(asyncHandler(authenticateJWT));

/**
 * GET /addresses
 * Returns the authenticated user's saved addresses.
 * Ordering: default first, then createdAt DESC.
 */
router.get('/', asyncHandler(addressController.getAddressesHandler));

/**
 * POST /addresses
 * Creates a saved address for the authenticated user.
 * The first address is always default.
 */
router.post(
  '/',
  validateRequest(createAddressSchema, 'body'),
  asyncHandler(addressController.createAddressHandler),
);

/**
 * PATCH /addresses/:id/default
 * Sets the given address as the user's sole default address.
 */
router.patch(
  '/:id/default',
  validateRequest(addressIdParamSchema, 'params'),
  asyncHandler(addressController.setDefaultAddressHandler),
);

/**
 * GET /addresses/:id
 * Returns a single address owned by the authenticated user.
 */
router.get(
  '/:id',
  validateRequest(addressIdParamSchema, 'params'),
  asyncHandler(addressController.getAddressByIdHandler),
);

/**
 * PATCH /addresses/:id
 * Updates an address owned by the authenticated user.
 */
router.patch(
  '/:id',
  validateRequest(addressIdParamSchema, 'params'),
  validateRequest(updateAddressSchema, 'body'),
  asyncHandler(addressController.updateAddressHandler),
);

/**
 * DELETE /addresses/:id
 * Deletes an address owned by the authenticated user.
 * If the default is deleted and others remain, the oldest remaining address
 * is promoted to default.
 */
router.delete(
  '/:id',
  validateRequest(addressIdParamSchema, 'params'),
  asyncHandler(addressController.deleteAddressHandler),
);

export default router;
