import { Router } from 'express';
import rolesRouter from '../../modules/roles/routes.js';
import categoriesRouter from '../../modules/categories/routes.js';
import attributesRouter from '../../modules/attributes/routes.js';
import productsRouter from '../../modules/products/routes.js';
import couponsRouter from '../../modules/coupons/routes.js';
import { authenticateJWT, requireRole } from '../../middleware/auth.js';
import { ROLES } from '../../shared/constants/index.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

const router = Router();

// Protect all admin routes
router.use(asyncHandler(authenticateJWT));
router.use(requireRole([ROLES.ADMIN]));

router.use('/roles', rolesRouter);
router.use('/categories', categoriesRouter);
router.use('/attributes', attributesRouter);
router.use('/products', productsRouter);
router.use('/coupons', couponsRouter);

export default router;
