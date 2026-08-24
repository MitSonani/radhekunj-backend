import { Router } from 'express';
import rolesRouter from '../../modules/roles/routes.js';
import categoriesRouter from '../../modules/categories/routes.js';
import { authenticateJWT, requireRole } from '../../middleware/auth.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

const router = Router();

// Protect all admin routes
router.use(asyncHandler(authenticateJWT));
router.use(requireRole(['admin']));

router.use('/roles', rolesRouter);
router.use('/categories', categoriesRouter);

export default router;
