import { z } from "zod";

export const placeOrderSchema = z.object({
  shippingAddressId: z.string().uuid("Invalid shipping address ID"),
  paymentMethod: z.enum(["COD", "RAZORPAY"]).default("COD"),
  idempotencyKey: z.string().min(1).max(128).optional(),
});

export const orderIdParamSchema = z.object({
  id: z.string().uuid("Invalid order ID"),
});

export const orderPaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// ---------------------------------------------------------------------------
// Admin Order Schemas
// ---------------------------------------------------------------------------

export const adminListOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z
    .enum(["PENDING_PAYMENT", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"])
    .optional(),
  paymentMethod: z.enum(["COD", "RAZORPAY"]).optional(),
  paymentStatus: z
    .enum(["PENDING", "AUTHORIZED", "PAID", "FAILED", "CANCELLED", "REFUNDED"])
    .optional(),
  shipmentStatus: z
    .enum([
      "NOT_BOOKED",
      "BOOKED",
      "PICKED_UP",
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "CANCELLED",
    ])
    .optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    "PENDING_PAYMENT",
    "CONFIRMED",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
  ]),
});

export const createShipmentSchema = z.object({
  trackingNumber: z.string().trim().max(100).optional(),
  courierName: z.string().trim().max(100).optional(),
  trackingUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((val) => (val === "" ? undefined : val)),
  providerShipmentId: z.string().trim().max(100).optional(),
  providerOrderId: z.string().trim().max(100).optional(),
  status: z
    .enum([
      "NOT_BOOKED",
      "BOOKED",
      "PICKED_UP",
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "CANCELLED",
    ])
    .default("BOOKED"),
});

export const updateShipmentStatusSchema = z.object({
  status: z.enum([
    "NOT_BOOKED",
    "BOOKED",
    "PICKED_UP",
    "IN_TRANSIT",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CANCELLED",
  ]),
});

export const updatePaymentStatusSchema = z.object({
  paymentStatus: z.enum([
    "PENDING",
    "AUTHORIZED",
    "PAID",
    "FAILED",
    "CANCELLED",
    "REFUNDED",
  ]),
});

export const shipmentIdParamSchema = z.object({
  id: z.string().uuid("Invalid order ID"),
  shipmentId: z.string().uuid("Invalid shipment ID"),
});

export const paymentIdParamSchema = z.object({
  id: z.string().uuid("Invalid order ID"),
  paymentId: z.string().uuid("Invalid payment ID"),
});
