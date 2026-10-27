import bannersRouter from '../../modules/banners/routes.js';
import { Router } from 'express';
import { API_PREFIX } from '../../shared/constants/index.js';
import adminRouter from './admin.js';
import authRouter from '../../modules/auth/routes.js';
import catalogRouter from '../../modules/catalog/routes.js';
import cartRouter from '../../modules/cart/routes.js';
import wishlistRouter from '../../modules/wishlist/routes.js';
import addressRouter from '../../modules/addresses/routes.js';
import ordersRouter from '../../modules/orders/routes.js';
import paymentsRouter from '../../modules/payments/routes.js';
import publicCategoriesRouter from '../../modules/categories/public.routes.js';

const router = Router();

router.use('/auth', authRouter);
router.use('/admin', adminRouter);
router.use('/categories', publicCategoriesRouter);
router.use('/products', catalogRouter);
router.use('/cart', cartRouter);
router.use('/wishlist', wishlistRouter);
router.use('/addresses', addressRouter);
router.use('/orders', ordersRouter);
router.use('/payments', paymentsRouter);
router.use('/banners', bannersRouter);


router.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'E-commerce API',
    version: API_PREFIX,
  });
});

export default router;
