import { Prisma, OrderStatus, ShipmentStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "../../database/prisma.js";
import type { AdminListOrdersFilters } from "./types.js";

export type DbClient = Prisma.TransactionClient | typeof prisma;

export async function runTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(fn);
}

// ---------------------------------------------------------------------------
// Select shapes
// ---------------------------------------------------------------------------

export const orderItemSelect = {
  id: true,
  orderId: true,
  productId: true,
  variantId: true,
  sku: true,
  productName: true,
  attributes: true,
  unitPrice: true,
  quantity: true,
  lineTotal: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OrderItemSelect;

export const paymentSelect = {
  id: true,
  orderId: true,
  paymentMethod: true,
  paymentStatus: true,
  amount: true,
  currency: true,
  provider: true,
  providerOrderId: true,
  providerPaymentId: true,
  providerSignature: true,
  metadata: true,
  paidAt: true,
  failureReason: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PaymentSelect;

export const refundSelect = {
  id: true,
  orderId: true,
  paymentId: true,
  amount: true,
  currency: true,
  status: true,
  gatewayRefundId: true,
  failureReason: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RefundSelect;

export const shipmentSelect = {
  id: true,
  orderId: true,
  provider: true,
  status: true,
  trackingNumber: true,
  providerShipmentId: true,
  providerOrderId: true,
  courierName: true,
  trackingUrl: true,
  bookedAt: true,
  shippedAt: true,
  deliveredAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ShipmentSelect;

export const userSummarySelect = {
  id: true,
  name: true,
  mobileNumber: true,
  countryCode: true,
} satisfies Prisma.UserSelect;

export const orderSelect = {
  id: true,
  orderNumber: true,
  idempotencyKey: true,
  userId: true,
  status: true,
  subtotal: true,
  discountAmount: true,
  shippingFee: true,
  taxAmount: true,
  totalAmount: true,
  shippingAddress: true,
  expiresAt: true,
  taxBreakdown: true,
  shippingDetails: true,
  refunds: {
    orderBy: { createdAt: "desc" as const },
    select: refundSelect,
  },

  createdAt: true,
  updatedAt: true,
  user: {
    select: userSummarySelect,
  },
  items: {
    orderBy: { createdAt: "asc" as const },
    select: orderItemSelect,
  },
  payments: {
    orderBy: { createdAt: "desc" as const },
    select: paymentSelect,
  },
  shipments: {
    orderBy: { createdAt: "desc" as const },
    select: shipmentSelect,
  },
} satisfies Prisma.OrderSelect;

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type OrderRecord = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;
export type OrderItemRecord = Prisma.OrderItemGetPayload<{ select: typeof orderItemSelect }>;
export type ShipmentRecord = Prisma.ShipmentGetPayload<{ select: typeof shipmentSelect }>;
export type RefundRecord = Prisma.RefundGetPayload<{ select: typeof refundSelect }>;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function findOrderById(
  id: string,
  db: DbClient = prisma,
): Promise<OrderRecord | null> {
  return db.order.findUnique({
    where: { id },
    select: orderSelect,
  });
}

export async function findOrderByOrderNumber(
  orderNumber: string,
  db: DbClient = prisma,
): Promise<OrderRecord | null> {
  return db.order.findUnique({
    where: { orderNumber },
    select: orderSelect,
  });
}

export async function findOrderByIdempotencyKey(
  idempotencyKey: string,
  db: DbClient = prisma,
): Promise<OrderRecord | null> {
  return db.order.findUnique({
    where: { idempotencyKey },
    select: orderSelect,
  });
}

export async function findUserOrderById(
  userId: string,
  orderId: string,
  db: DbClient = prisma,
): Promise<OrderRecord | null> {
  return db.order.findFirst({
    where: { id: orderId, userId },
    select: orderSelect,
  });
}

export async function findUserOrders(
  userId: string,
  opts: { skip: number; take: number },
  db: DbClient = prisma,
): Promise<OrderRecord[]> {
  return db.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: opts.skip,
    take: opts.take,
    select: orderSelect,
  });
}

export async function countUserOrders(
  userId: string,
  db: DbClient = prisma,
): Promise<number> {
  return db.order.count({
    where: { userId },
  });
}

// ---------------------------------------------------------------------------
// Admin Queries & Filters
// ---------------------------------------------------------------------------

function buildAdminOrderWhere(filters: AdminListOrdersFilters): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.paymentMethod) {
    where.payments = {
      some: {
        paymentMethod: filters.paymentMethod,
      },
    };
  }

  if (filters.paymentStatus) {
    where.payments = {
      some: {
        paymentStatus: filters.paymentStatus,
      },
    };
  }

  if (filters.shipmentStatus) {
    if (filters.shipmentStatus === "NOT_BOOKED") {
      where.OR = [
        { shipments: { none: {} } },
        { shipments: { some: { status: "NOT_BOOKED" } } },
      ];
    } else {
      where.shipments = {
        some: {
          status: filters.shipmentStatus,
        },
      };
    }
  }

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) {
      where.createdAt.gte = filters.startDate;
    }
    if (filters.endDate) {
      where.createdAt.lte = filters.endDate;
    }
  }

  if (filters.search) {
    const s = filters.search;
    const searchClauses: Prisma.OrderWhereInput[] = [
      { orderNumber: { contains: s, mode: "insensitive" } },
      { user: { name: { contains: s, mode: "insensitive" } } },
      { user: { mobileNumber: { contains: s } } },
      { shipments: { some: { trackingNumber: { contains: s, mode: "insensitive" } } } },
    ];

    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchClauses }];
      delete where.OR;
    } else {
      where.OR = searchClauses;
    }
  }

  return where;
}

export async function findAdminOrders(
  filters: AdminListOrdersFilters,
  opts: { skip: number; take: number },
  db: DbClient = prisma,
): Promise<OrderRecord[]> {
  const where = buildAdminOrderWhere(filters);
  return db.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: opts.skip,
    take: opts.take,
    select: orderSelect,
  });
}

export async function countAdminOrders(
  filters: AdminListOrdersFilters,
  db: DbClient = prisma,
): Promise<number> {
  const where = buildAdminOrderWhere(filters);
  return db.order.count({ where });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface CreateOrderData {
  orderNumber: string;
  idempotencyKey?: string | null;
  userId: string;
  status: OrderStatus;
  subtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  shippingFee: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  shippingAddress: Prisma.InputJsonValue;
  expiresAt?: Date | null;
  taxBreakdown?: Prisma.InputJsonValue;
  shippingDetails?: Prisma.InputJsonValue;

  items: Array<{
    productId: string;
    variantId: string;
    sku: string;
    productName: string;
    attributes: Prisma.InputJsonValue;
    unitPrice: Prisma.Decimal;
    quantity: number;
    lineTotal: Prisma.Decimal;
  }>;
}

export async function createOrder(
  data: CreateOrderData,
  db: DbClient = prisma,
): Promise<OrderRecord> {
  return db.order.create({
    data: {
      orderNumber: data.orderNumber,
      idempotencyKey: data.idempotencyKey ?? null,
      userId: data.userId,
      status: data.status,
      subtotal: data.subtotal,
      discountAmount: data.discountAmount,
      shippingFee: data.shippingFee,
      taxAmount: data.taxAmount,
      totalAmount: data.totalAmount,
      shippingAddress: data.shippingAddress,
      expiresAt: data.expiresAt ?? null,
      taxBreakdown: data.taxBreakdown ?? undefined,
      shippingDetails: data.shippingDetails ?? undefined,
      items: {
        create: data.items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          sku: item.sku,
          productName: item.productName,
          attributes: item.attributes,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
        })),
      },
    },
    select: orderSelect,
  });
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  db: DbClient = prisma,
): Promise<OrderRecord> {
  return db.order.update({
    where: { id: orderId },
    data: { status },
    select: orderSelect,
  });
}

// ---------------------------------------------------------------------------
// Shipment Repository Methods
// ---------------------------------------------------------------------------

export interface CreateShipmentRecordData {
  orderId: string;
  provider?: string;
  status?: ShipmentStatus;
  trackingNumber?: string | null;
  providerShipmentId?: string | null;
  providerOrderId?: string | null;
  courierName?: string | null;
  trackingUrl?: string | null;
  bookedAt?: Date | null;
  shippedAt?: Date | null;
  deliveredAt?: Date | null;
}

export async function createShipment(
  data: CreateShipmentRecordData,
  db: DbClient = prisma,
): Promise<ShipmentRecord> {
  return db.shipment.create({
    data: {
      orderId: data.orderId,
      provider: data.provider ?? "SHIPROCKET",
      status: data.status ?? "BOOKED",
      trackingNumber: data.trackingNumber ?? null,
      providerShipmentId: data.providerShipmentId ?? null,
      providerOrderId: data.providerOrderId ?? null,
      courierName: data.courierName ?? null,
      trackingUrl: data.trackingUrl ?? null,
      bookedAt: data.bookedAt ?? new Date(),
      shippedAt: data.shippedAt ?? null,
      deliveredAt: data.deliveredAt ?? null,
    },
    select: shipmentSelect,
  });
}

export async function findShipmentById(
  id: string,
  db: DbClient = prisma,
): Promise<ShipmentRecord | null> {
  return db.shipment.findUnique({
    where: { id },
    select: shipmentSelect,
  });
}

export async function findActiveShipmentByOrderId(
  orderId: string,
  db: DbClient = prisma,
): Promise<ShipmentRecord | null> {
  return db.shipment.findFirst({
    where: {
      orderId,
      status: { not: "CANCELLED" },
    },
    orderBy: { createdAt: "desc" },
    select: shipmentSelect,
  });
}

export async function updateShipment(
  id: string,
  data: Prisma.ShipmentUpdateInput,
  db: DbClient = prisma,
): Promise<ShipmentRecord> {
  return db.shipment.update({
    where: { id },
    data,
    select: shipmentSelect,
  });
}

// ---------------------------------------------------------------------------
// Payment Status Mutation
// ---------------------------------------------------------------------------

export async function updatePaymentStatus(
  paymentId: string,
  paymentStatus: PaymentStatus,
  paidAt: Date | null = null,
  db: DbClient = prisma,
) {
  return db.payment.update({
    where: { id: paymentId },
    data: {
      paymentStatus,
      paidAt: paymentStatus === "PAID" ? paidAt ?? new Date() : undefined,
    },
    select: paymentSelect,
  });
}

// ---------------------------------------------------------------------------
// Inventory Row Locking
// ---------------------------------------------------------------------------

export async function lockInventoryRows(
  variantIds: string[],
  db: Prisma.TransactionClient,
): Promise<void> {
  const sorted = Array.from(new Set(variantIds)).sort();
  for (const variantId of sorted) {
    await db.$queryRaw`SELECT id FROM inventory WHERE variant_id = ${variantId}::uuid FOR UPDATE`;
  }
}


// ---------------------------------------------------------------------------
// Inventory & Coupon Integrity Helpers
// ---------------------------------------------------------------------------

export async function reserveInventory(
  items: Array<{ variantId: string; quantity: number }>,
  tx: Prisma.TransactionClient,
): Promise<void> {
  for (const item of items) {
    await tx.inventory.update({
      where: { variantId: item.variantId },
      data: {
        reservedQuantity: { increment: item.quantity },
      },
    });
  }
}

export async function commitReservedInventory(
  items: Array<{ variantId: string; quantity: number }>,
  tx: Prisma.TransactionClient,
): Promise<void> {
  for (const item of items) {
    await tx.inventory.update({
      where: { variantId: item.variantId },
      data: {
        quantity: { decrement: item.quantity },
        reservedQuantity: { decrement: item.quantity },
      },
    });
  }
}

export async function releaseReservedInventory(
  items: Array<{ variantId: string; quantity: number }>,
  tx: Prisma.TransactionClient,
): Promise<void> {
  for (const item of items) {
    await tx.inventory.update({
      where: { variantId: item.variantId },
      data: {
        reservedQuantity: { decrement: item.quantity },
      },
    });
  }
}

export async function restoreCommittedInventory(
  items: Array<{ variantId: string; quantity: number }>,
  tx: Prisma.TransactionClient,
): Promise<void> {
  for (const item of items) {
    await tx.inventory.update({
      where: { variantId: item.variantId },
      data: {
        quantity: { increment: item.quantity },
      },
    });
  }
}

export async function rollbackCouponUsage(
  orderId: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const usage = await tx.couponUsage.findFirst({
    where: { orderId },
  });
  if (usage) {
    await tx.couponUsage.delete({
      where: { id: usage.id },
    });
  }
}
