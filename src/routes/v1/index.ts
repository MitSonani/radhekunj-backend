import { Router } from 'express';
import { API_PREFIX } from '../../shared/constants/index.js';
import adminRouter from './admin.js';
import authRouter from '../../modules/auth/routes.js';
import catalogRouter from '../../modules/catalog/routes.js';
import cartRouter from '../../modules/cart/routes.js';

const router = Router();

router.use('/auth', authRouter);
router.use('/admin', adminRouter);
router.use('/products', catalogRouter);
router.use('/cart', cartRouter);

router.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'E-commerce API',
    version: API_PREFIX,
  });
});

export default router;
