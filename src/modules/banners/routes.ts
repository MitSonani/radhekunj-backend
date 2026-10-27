import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import * as bannerController from './controller.js';

const router = Router();

router.get('/', asyncHandler(bannerController.getActiveBannersHandler));

export default router;
