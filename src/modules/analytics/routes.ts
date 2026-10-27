import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import * as analyticsController from './controller.js';

const router = Router();

router.get('/dashboard', asyncHandler(analyticsController.getDashboardAnalyticsHandler));

export default router;
