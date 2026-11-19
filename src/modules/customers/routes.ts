import { Router } from "express";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { validateRequest } from "../../shared/utils/validateRequest.js";
import * as customerController from "./controller.js";
import {
  customerIdParamSchema,
  listCustomersQuerySchema,
  updateCustomerStatusSchema,
} from "./validation.js";

const router = Router();

/**
 * GET /admin/customers
 * Returns paginated, searchable, sorted and filtered customers list.
 */
router.get(
  "/",
  validateRequest(listCustomersQuerySchema, "query"),
  asyncHandler(customerController.listCustomersHandler),
);

/**
 * GET /admin/customers/:id
 * Returns customer profile, addresses, total stats and order history.
 */
router.get(
  "/:id",
  validateRequest(customerIdParamSchema, "params"),
  asyncHandler(customerController.getCustomerByIdHandler),
);

/**
 * PATCH /admin/customers/:id/status
 * Enables or disables customer account safely.
 */
router.patch(
  "/:id/status",
  validateRequest(customerIdParamSchema, "params"),
  validateRequest(updateCustomerStatusSchema, "body"),
  asyncHandler(customerController.updateCustomerStatusHandler),
);

export default router;

