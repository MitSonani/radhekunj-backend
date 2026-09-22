import { Router } from 'express';
import { validateRequest } from '../../shared/utils/validateRequest.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import * as couponController from './controller.js';
import {
  couponIdParamSchema,
  createCouponSchema,
  listCouponUsagesQuerySchema,
  listCouponsQuerySchema,
  updateCouponSchema,
} from './validation.js';

const router = Router();

router.post(
  '/',
  validateRequest(createCouponSchema, 'body'),
  asyncHandler(couponController.createCouponHandler),
);

router.get(
  '/',
  validateRequest(listCouponsQuerySchema, 'query'),
  asyncHandler(couponController.listCouponsHandler),
);

router.get(
  '/:id/usages',
  validateRequest(couponIdParamSchema, 'params'),
  validateRequest(listCouponUsagesQuerySchema, 'query'),
  asyncHandler(couponController.listCouponUsagesHandler),
);

router.patch(
  '/:id/activate',
  validateRequest(couponIdParamSchema, 'params'),
  asyncHandler(couponController.activateCouponHandler),
);

router.patch(
  '/:id/deactivate',
  validateRequest(couponIdParamSchema, 'params'),
  asyncHandler(couponController.deactivateCouponHandler),
);

router.get(
  '/:id',
  validateRequest(couponIdParamSchema, 'params'),
  asyncHandler(couponController.getCouponByIdHandler),
);

router.patch(
  '/:id',
  validateRequest(couponIdParamSchema, 'params'),
  validateRequest(updateCouponSchema, 'body'),
  asyncHandler(couponController.updateCouponHandler),
);

router.delete(
  '/:id',
  validateRequest(couponIdParamSchema, 'params'),
  asyncHandler(couponController.archiveCouponHandler),
);

export default router;
