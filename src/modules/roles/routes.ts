import { Router } from 'express';
import { validateRequest } from '../../shared/utils/validateRequest.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import * as roleController from './controller.js';
import { createRoleSchema, updateRoleSchema, roleIdParamSchema } from './validation.js';

const router = Router();

router.post(
  '/',
  validateRequest(createRoleSchema, 'body'),
  asyncHandler(roleController.createRoleHandler),
);

router.get(
  '/',
  asyncHandler(roleController.getAllRolesHandler),
);

router.get(
  '/:id',
  validateRequest(roleIdParamSchema, 'params'),
  asyncHandler(roleController.getRoleByIdHandler),
);

router.patch(
  '/:id',
  validateRequest(roleIdParamSchema, 'params'),
  validateRequest(updateRoleSchema, 'body'),
  asyncHandler(roleController.updateRoleHandler),
);

router.delete(
  '/:id',
  validateRequest(roleIdParamSchema, 'params'),
  asyncHandler(roleController.deleteRoleHandler),
);

export default router;
