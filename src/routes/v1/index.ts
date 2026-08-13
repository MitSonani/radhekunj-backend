import { Router } from 'express';
import { API_PREFIX } from '../../shared/constants/index.js';

const router = Router();

// Future versioned business routes will be mounted here.
// Example: router.use('/users', userRoutes);

router.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'E-commerce API',
    version: API_PREFIX,
  });
});

export default router;
