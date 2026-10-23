import { Router } from "express";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { validateRequest } from "../../shared/utils/validateRequest.js";
import * as adminOrderController from "./admin.controller.js";
import {
  adminListOrdersQuerySchema,
  orderIdParamSchema,
  updateOrderStatusSchema,
  createShipmentSchema,
  updateShipmentStatusSchema,
  updatePaymentStatusSchema,
  shipmentIdParamSchema,
  paymentIdParamSchema,
} from "./validation.js";

const router = Router();

/**
 * GET /admin/orders
 * Returns paginated, searchable, and filtered orders for administrators.
 */
router.get(
  "/",
  validateRequest(adminListOrdersQuerySchema, "query"),
  asyncHandler(adminOrderController.listOrdersHandler),
);

/**
 * GET /admin/orders/:id
 * Returns complete order details including customer, address, payment, and shipment info.
 */
router.get(
  "/:id",
  validateRequest(orderIdParamSchema, "params"),
  asyncHandler(adminOrderController.getOrderByIdHandler),
);

/**
 * PATCH /admin/orders/:id/status
 * Updates order status according to valid lifecycle state transitions.
 */
router.patch(
  "/:id/status",
  validateRequest(orderIdParamSchema, "params"),
  validateRequest(updateOrderStatusSchema, "body"),
  asyncHandler(adminOrderController.updateOrderStatusHandler),
);

/**
 * POST /admin/orders/:id/shipment
 * Manually adds external Shiprocket shipment information for an order.
 */
router.post(
  "/:id/shipment",
  validateRequest(orderIdParamSchema, "params"),
  validateRequest(createShipmentSchema, "body"),
  asyncHandler(adminOrderController.createShipmentHandler),
);

/**
 * PATCH /admin/orders/:id/shipment/:shipmentId/status
 * Updates manual shipment status and synchronizes order status where appropriate.
 */
router.patch(
  "/:id/shipment/:shipmentId/status",
  validateRequest(shipmentIdParamSchema, "params"),
  validateRequest(updateShipmentStatusSchema, "body"),
  asyncHandler(adminOrderController.updateShipmentStatusHandler),
);

/**
 * PATCH /admin/orders/:id/payments/:paymentId/status
 * Updates payment status (e.g., records cash collection for COD orders).
 */
router.patch(
  "/:id/payments/:paymentId/status",
  validateRequest(paymentIdParamSchema, "params"),
  validateRequest(updatePaymentStatusSchema, "body"),
  asyncHandler(adminOrderController.updatePaymentStatusHandler),
);

export default router;
