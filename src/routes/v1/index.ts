import { Router } from 'express';
import { API_PREFIX } from '../../shared/constants/index.js';
import adminRouter from './admin.js';
import authRouter from '../../modules/auth/routes.js';

const router = Router();

// Future versioned business routes will be mounted here.
// Example: router.use('/users', userRoutes);
router.use('/auth', authRouter);
router.use('/admin', adminRouter);

router.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'E-commerce API',
    version: API_PREFIX,
  });
});

export default router;
