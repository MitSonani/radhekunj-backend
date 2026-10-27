import { Router } from 'express';
import { validateRequest } from '../../shared/utils/validateRequest.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import * as authController from './controller.js';
import { sendOtpSchema, verifyOtpSchema, verifyAdminOtpSchema, updateProfileSchema } from './validation.js';
import { authenticateJWT } from '../../middleware/auth.js';

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


router.get('/me', asyncHandler(authenticateJWT), asyncHandler(authController.getProfileHandler));
router.get('/profile', asyncHandler(authenticateJWT), asyncHandler(authController.getProfileHandler));
router.patch(
  '/profile',
  asyncHandler(authenticateJWT),
  validateRequest(updateProfileSchema, 'body'),
  asyncHandler(authController.updateProfileHandler),
);

export default router;
