import { Router } from 'express';
import healthRoutes from './health.routes.js';
import v1Routes from './v1/index.js';
import { API_PREFIX } from '../shared/constants/index.js';

const router = Router();

router.use(healthRoutes);
router.use(API_PREFIX, v1Routes);

export default router;
