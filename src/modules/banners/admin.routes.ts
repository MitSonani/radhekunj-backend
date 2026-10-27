import { Router } from 'express';
import { validateRequest } from '../../shared/utils/validateRequest.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import * as bannerController from './controller.js';
import {
  bannerIdParamSchema,
  bannerUploadUrlSchema,
  createBannerSchema,
  updateBannerSchema,
} from './validation.js';

const router = Router();

router.get('/', asyncHandler(bannerController.listAllBannersHandler));

router.post(
  '/',
  validateRequest(createBannerSchema, 'body'),
  asyncHandler(bannerController.createBannerHandler),
);

router.post(
  '/upload-url',
  validateRequest(bannerUploadUrlSchema, 'body'),
  asyncHandler(bannerController.createBannerUploadUrlHandler),
);

router.get(
  '/:id',
  validateRequest(bannerIdParamSchema, 'params'),
  asyncHandler(bannerController.getBannerByIdHandler),
);

router.put(
  '/:id',
  validateRequest(bannerIdParamSchema, 'params'),
  validateRequest(updateBannerSchema, 'body'),
  asyncHandler(bannerController.updateBannerHandler),
);

router.delete(
  '/:id',
  validateRequest(bannerIdParamSchema, 'params'),
  asyncHandler(bannerController.deleteBannerHandler),
);

export default router;
