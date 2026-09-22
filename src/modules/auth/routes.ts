import { Router } from 'express';
import { validateRequest } from '../../shared/utils/validateRequest.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import * as authController from './controller.js';
import { sendOtpSchema, verifyOtpSchema, verifyAdminOtpSchema } from './validation.js';

const router = Router();

router.post(
  '/otp/send',
  validateRequest(sendOtpSchema, 'body'),
  asyncHandler(authController.sendOtpHandler),
);

router.post(
  '/otp/verify',
  validateRequest(verifyOtpSchema, 'body'),
  asyncHandler(authController.verifyOtpHandler),
);

router.post(
  '/admin/otp/send',
  validateRequest(sendOtpSchema, 'body'),
  asyncHandler(authController.sendAdminOtpHandler),
);

router.post(
  '/admin/otp/verify',
  validateRequest(verifyAdminOtpSchema, 'body'),
  asyncHandler(authController.verifyAdminOtpHandler),
);

export default router;
