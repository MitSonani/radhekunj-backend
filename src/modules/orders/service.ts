import { prisma } from "../../database/prisma.js";
import { calculateFinancials, checkCodEligibility } from "../financial/service.js";
import { scheduleOrderExpiry } from "./expiryQueue.js";
import { createRefundRecord, processRefund } from "../payments/refundService.js";
import crypto from "crypto";
import { Prisma, OrderStatus, PaymentMethod, PaymentStatus, ShipmentStatus } from "@prisma/client";
import { AppError, NotFoundError } from "../../shared/errors/appError.js";
import { env } from "../../config/env.js";
import * as orderRepository from "./repository.js";
import * as cartRepository from "../cart/repository.js";
import * as addressRepository from "../addresses/repository.js";
import * as couponService from "../coupons/service.js";
import * as paymentRepository from "../payments/repository.js";
import { toPaymentResponse } from "../payments/service.js";
import { toAddressSnapshot, type AddressSnapshot } from "../addresses/service.js";
import type {
  OrderResponse,
  OrderListResponse,
  PlaceOrderInput,
  ShipmentResponse,
  CustomerShipmentResponse,
  AdminOrderListItem,
  AdminOrderDetailResponse,
  AdminOrderListResponse,
  AdminListOrdersFilters,
  CreateShipmentInput,
} from "./types.js";

// ---------------------------------------------------------------------------
// Helpers & State Machines
// ---------------------------------------------------------------------------

export const VALID_ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING_PAYMENT]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

export const VALID_SHIPMENT_STATUS_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  [ShipmentStatus.NOT_BOOKED]: [ShipmentStatus.BOOKED, ShipmentStatus.CANCELLED],
  [ShipmentStatus.BOOKED]: [
    ShipmentStatus.PICKED_UP,
    ShipmentStatus.IN_TRANSIT,
    ShipmentStatus.CANCELLED,
  ],
  [ShipmentStatus.PICKED_UP]: [
    ShipmentStatus.IN_TRANSIT,
    ShipmentStatus.OUT_FOR_DELIVERY,
    ShipmentStatus.CANCELLED,
  ],
  [ShipmentStatus.IN_TRANSIT]: [
    ShipmentStatus.OUT_FOR_DELIVERY,
    ShipmentStatus.DELIVERED,
    ShipmentStatus.CANCELLED,
  ],
  [ShipmentStatus.OUT_FOR_DELIVERY]: [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED],
  [ShipmentStatus.DELIVERED]: [],
  [ShipmentStatus.CANCELLED]: [],
};

export function generateOrderNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `ORD-${dateStr}-${randomSuffix}`;
}

function toCartLineForCoupon(item: {
  id: string;
  variantId: string;
  quantity: number;
  variant: {
    price: Prisma.Decimal;
    productId: string;
    product: { categoryId: string | null };
  };
}): couponService.CartLineForCoupon {
  return {
    cartItemId: item.id,
    productId: item.variant.productId,
    categoryId: item.variant.product.categoryId ?? "",
    unitPrice: new Prisma.Decimal(item.variant.price),
    quantity: item.quantity,
    isAvailable: true,
  };
}

export function toShipmentResponse(record: orderRepository.ShipmentRecord): ShipmentResponse {
  return {
    id: record.id,
    orderId: record.orderId,
    provider: record.provider,
    status: record.status,
    trackingNumber: record.trackingNumber,
    providerShipmentId: record.providerShipmentId,
    providerOrderId: record.providerOrderId,
    courierName: record.courierName,
    trackingUrl: record.trackingUrl,
    bookedAt: record.bookedAt,
    shippedAt: record.shippedAt,
    deliveredAt: record.deliveredAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function toCustomerShipmentResponse(
  record: orderRepository.ShipmentRecord,
): CustomerShipmentResponse {
  return {
    id: record.id,
    status: record.status,
    courierName: record.courierName,
    trackingNumber: record.trackingNumber,
    trackingUrl: record.trackingUrl,
    shippedAt: record.shippedAt,
    deliveredAt: record.deliveredAt,
  };
}

export function toOrderResponse(record: orderRepository.OrderRecord): OrderResponse {
  const rawAddress = (record.shippingAddress ?? {}) as Record<string, unknown>;
  const getString = (key: string, fallback = ''): string => {
    const val = rawAddress[key];
    return typeof val === 'string' ? val : fallback;
  };
  const shippingAddress: AddressSnapshot = {
    fullName: getString('fullName'),
    countryCode: getString('countryCode', '+91'),
    mobileNumber: getString('mobileNumber'),
    addressLine1: getString('addressLine1'),
    addressLine2: typeof rawAddress['addressLine2'] === 'string' ? rawAddress['addressLine2'] : null,
    city: getString('city'),
    state: getString('state'),
    postalCode: getString('postalCode'),
    country: getString('country'),
  };

  const payments = record.payments ? record.payments.map(toPaymentResponse) : [];
  const primaryPayment = payments[0];

  const shipments = record.shipments ? record.shipments.map(toShipmentResponse) : [];
  const activeShipment = shipments.find((s) => s.status !== "CANCELLED") ?? shipments[0];
  const refunds = (record.refunds || []).map((r) => ({
    id: r.id,
    orderId: r.orderId,
    paymentId: r.paymentId,
    amount: r.amount.toFixed(2),
    currency: r.currency,
    status: r.status,
    gatewayRefundId: r.gatewayRefundId,
    failureReason: r.failureReason,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  const customerShipment: CustomerShipmentResponse | undefined = activeShipment
    ? {
        id: activeShipment.id,
        status: activeShipment.status,
        courierName: activeShipment.courierName,
        trackingNumber: activeShipment.trackingNumber,
        trackingUrl: activeShipment.trackingUrl,
        shippedAt: activeShipment.shippedAt,
        deliveredAt: activeShipment.deliveredAt,
      }
    : undefined;

  return {
    id: record.id,
    orderNumber: record.orderNumber,
    userId: record.userId,
    status: record.status,
    subtotal: record.subtotal.toFixed(2),
    discountAmount: record.discountAmount.toFixed(2),
    shippingFee: record.shippingFee.toFixed(2),
    taxAmount: record.taxAmount.toFixed(2),
    totalAmount: record.totalAmount.toFixed(2),
    shippingAddress,
    paymentMethod: primaryPayment?.paymentMethod,
    paymentStatus: primaryPayment?.paymentStatus,
    payments,
    expiresAt: record.expiresAt,
    taxBreakdown: (record.taxBreakdown as Record<string, unknown>) ?? null,
    shippingDetails: (record.shippingDetails as Record<string, unknown>) ?? null,
    refunds,
    shipment: customerShipment,
    shipments,
    items: record.items.map((item) => ({
      id: item.id,
      orderId: item.orderId,
      productId: item.productId,
      variantId: item.variantId,
      sku: item.sku,
      productName: item.productName,
      attributes: (item.attributes as Array<{ name: string; value: string }>) || [],
      unitPrice: item.unitPrice.toFixed(2),
      quantity: item.quantity,
      lineTotal: item.lineTotal.toFixed(2),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function toAdminOrderListItem(record: orderRepository.OrderRecord): AdminOrderListItem {
  const payments = record.payments ? record.payments.map(toPaymentResponse) : [];
  const primaryPayment = payments[0];
  const latestShipment = record.shipments && record.shipments.length > 0 ? record.shipments[0] : null;

  return {
    id: record.id,
    orderNumber: record.orderNumber,
    customer: {
      id: record.user.id,
      name: record.user.name,
      mobileNumber: record.user.mobileNumber,
      countryCode: record.user.countryCode ?? '+91',
    },
    status: record.status,
    subtotal: record.subtotal.toFixed(2),
    discountAmount: record.discountAmount.toFixed(2),
    shippingFee: record.shippingFee.toFixed(2),
    taxAmount: record.taxAmount.toFixed(2),
    totalAmount: record.totalAmount.toFixed(2),
    paymentMethod: primaryPayment?.paymentMethod ?? null,
    paymentStatus: primaryPayment?.paymentStatus ?? null,
    shipmentStatus: latestShipment?.status ?? null,
    itemCount: record.items.reduce((sum, item) => sum + item.quantity, 0),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function toAdminOrderDetailResponse(
  record: orderRepository.OrderRecord,
): AdminOrderDetailResponse {
  const base = toOrderResponse(record);
  const activeShipmentRecord =
    record.shipments?.find((s) => s.status !== "CANCELLED") ?? record.shipments?.[0];

  return {
    ...base,
    customer: {
      id: record.user.id,
      name: record.user.name,
      mobileNumber: record.user.mobileNumber,
      countryCode: record.user.countryCode ?? '+91',
    },
    shipment: activeShipmentRecord ? toShipmentResponse(activeShipmentRecord) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Customer Order Services
// ---------------------------------------------------------------------------

export async function placeOrder(
  userId: string,
  input: PlaceOrderInput,
): Promise<OrderResponse> {
  const chosenPaymentMethod = input.paymentMethod ?? PaymentMethod.COD;

  if (input.idempotencyKey) {
    const existingOrder = await orderRepository.findOrderByIdempotencyKey(
      input.idempotencyKey,
    );
    if (existingOrder) {
      if (existingOrder.userId !== userId) {
        throw new AppError(403, "Forbidden: Idempotency key already used by another account");
      }
      return toOrderResponse(existingOrder);
    }
  }

  const address = await addressRepository.findAddressByIdForUser(input.shippingAddressId, userId);
  if (!address) {
    throw new AppError(422, "Shipping address not found or does not belong to you");
  }
  const addressSnapshot = toAddressSnapshot(address);

  const cart = await cartRepository.findCartByUserId(userId);
  if (!cart || cart.items.length === 0) {
    throw new AppError(422, "Cannot place an order with an empty cart");
  }

  const placedOrder = await orderRepository.runTransaction(async (tx) => {
    for (const item of cart.items) {
      if (!item.variant.product.status || item.variant.product.status !== "ACTIVE") {
        throw new AppError(422, `Product "${item.variant.product.name}" is no longer active`);
      }
      if (!item.variant.status || item.variant.status !== "ACTIVE") {
        throw new AppError(422, `Product variant with SKU "${item.variant.sku}" is no longer active`);
      }
    }

    // Pessimistic locking: lock all inventory rows in deterministic sorted order
    const variantIds = cart.items.map((item) => item.variantId);
    await orderRepository.lockInventoryRows(variantIds, tx);

    // Re-read stock after acquiring exclusive row locks
    for (const item of cart.items) {
      const inv = await tx.inventory.findUnique({
        where: { variantId: item.variantId },
      });

      const available = inv ? inv.quantity - inv.reservedQuantity : 0;
      if (!inv || available < item.quantity) {
        throw new AppError(
          422,
          `Insufficient stock for SKU "${item.variant.sku}". Requested ${item.quantity}, available ${available}`,
        );
      }
    }

    let subtotal = new Prisma.Decimal(0);
    const orderItemsData: orderRepository.CreateOrderData["items"] = [];

    for (const item of cart.items) {
      const unitPrice = item.variant.price;
      const lineTotal = unitPrice.mul(item.quantity);
      subtotal = subtotal.add(lineTotal);

      const attributesJson = item.variant.attributes.map((attr) => ({
        name: attr.attributeValue.attribute.name,
        value: attr.attributeValue.value,
      }));

      orderItemsData.push({
        productId: item.variant.productId,
        variantId: item.variantId,
        sku: item.variant.sku,
        productName: item.variant.product.name,
        attributes: attributesJson,
        unitPrice,
        quantity: item.quantity,
        lineTotal,
      });
    }

    let discountAmount = new Prisma.Decimal(0);
    let couponIdToConsume: string | null = null;
    if (cart.couponId) {
      const couponLines = cart.items.map((item) => toCartLineForCoupon(item));
      const evaluation = await couponService.revalidateStoredCoupon(
        cart.couponId,
        userId,
        couponLines,
      );

      if (!evaluation) {
        throw new AppError(422, "The coupon applied to your cart is no longer valid or eligible");
      }

      discountAmount = evaluation.discountAmount;
      couponIdToConsume = evaluation.couponId;
    }

    const financials = await calculateFinancials({
      subtotal,
      discountAmount,
      customerState: addressSnapshot.state,
    });

    const shippingFee = financials.shippingFee;
    const taxAmount = financials.taxAmount;
    const totalAmount = financials.totalAmount;

    const isOnlinePayment = chosenPaymentMethod === PaymentMethod.RAZORPAY;

    if (chosenPaymentMethod === PaymentMethod.COD) {
      const codEligibility = await checkCodEligibility({
        totalAmount,
        postalCode: addressSnapshot.postalCode,
      });

      if (!codEligibility.isEligible) {
        throw new AppError(422, codEligibility.reason || 'Cash on Delivery is not available for this order');
      }
    }
    const initialOrderStatus: OrderStatus = isOnlinePayment
      ? OrderStatus.PENDING_PAYMENT
      : OrderStatus.CONFIRMED;

    const expiresAt = isOnlinePayment ? new Date(Date.now() + 15 * 60 * 1000) : null;

    if (isOnlinePayment) {
      // Online order: atomically reserve inventory for 15 minutes
      await orderRepository.reserveInventory(cart.items, tx);
    } else {
      // COD: commit physical stock immediately
      try {
        for (const item of cart.items) {
          await tx.inventory.update({
            where: { variantId: item.variantId },
            data: {
              quantity: { decrement: item.quantity },
            },
          });
        }
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          (err.message.includes("inventory_quantity_nonnegative") ||
            err.message.includes("check constraint"))
        ) {
          throw new AppError(422, "Insufficient stock to fulfill this order");
        }
        throw err;
      }
    }

    const orderNumber = generateOrderNumber();
    const order = await orderRepository.createOrder(
      {
        orderNumber,
        idempotencyKey: input.idempotencyKey,
        userId,
        status: initialOrderStatus,
        subtotal,
        discountAmount,
        shippingFee,
        taxAmount,
        totalAmount,
        shippingAddress: addressSnapshot,
        expiresAt,
        taxBreakdown: financials.taxBreakdown as unknown as Prisma.InputJsonValue,
        shippingDetails: financials.shippingDetails as unknown as Prisma.InputJsonValue,
        items: orderItemsData,
      },
      tx,
    );

    let providerOrderId: string | null = null;
    const providerPaymentId: string | null = null;

    if (chosenPaymentMethod === PaymentMethod.RAZORPAY) {
      providerOrderId = `order_mock_${crypto.randomBytes(8).toString("hex")}`;
    }

    await paymentRepository.createPayment(
      {
        orderId: order.id,
        paymentMethod: chosenPaymentMethod,
        paymentStatus: PaymentStatus.PENDING,
        amount: totalAmount,
        currency: "INR",
        provider: chosenPaymentMethod === PaymentMethod.RAZORPAY ? "RAZORPAY" : null,
        providerOrderId,
        providerPaymentId,
      },
      tx,
    );

    if (couponIdToConsume) {
      await couponService.consumeCouponUsage(tx, {
        couponId: couponIdToConsume,
        userId,
        orderId: order.id,
        discountAmount,
      });
    }

    await cartRepository.clearCartItems(cart.id, tx);
    if (cart.couponId) {
      await cartRepository.setCartCouponId(cart.id, null, tx);
    }

    const fullOrder = await orderRepository.findOrderById(order.id, tx);
    if (!fullOrder) {
      throw new AppError(500, "Failed to retrieve placed order");
    }

    const orderResponse = toOrderResponse(fullOrder);

    if (chosenPaymentMethod === PaymentMethod.RAZORPAY && providerOrderId) {
      const paiseAmount = Math.round(Number(totalAmount) * 100);
      orderResponse.razorpay = {
        keyId: env.RAZORPAY_KEY_ID || "rzp_test_mock_id",
        razorpayOrderId: providerOrderId,
        amount: paiseAmount,
        currency: "INR",
      };
    }

    return orderResponse;
  });

  if (chosenPaymentMethod === PaymentMethod.RAZORPAY) {
    await scheduleOrderExpiry(placedOrder.id, 15 * 60 * 1000);
  }

  return placedOrder;
}

export async function getUserOrders(
  userId: string,
  pagination: { page: number; limit: number },
): Promise<OrderListResponse> {
  const skip = (pagination.page - 1) * pagination.limit;
  const take = pagination.limit;

  const [records, total] = await Promise.all([
    orderRepository.findUserOrders(userId, { skip, take }),
    orderRepository.countUserOrders(userId),
  ]);

  return {
    items: records.map(toOrderResponse),
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
    },
  };
}

export async function getUserOrderById(
  userId: string,
  orderId: string,
): Promise<OrderResponse> {
  const order = await orderRepository.findUserOrderById(userId, orderId);
  if (!order) {
    throw new NotFoundError("Order not found");
  }

  return toOrderResponse(order);
}

// ---------------------------------------------------------------------------
// Admin Order Services
// ---------------------------------------------------------------------------

export async function getAdminOrders(
  filters: AdminListOrdersFilters,
  pagination: { page: number; limit: number },
): Promise<AdminOrderListResponse> {
  const skip = (pagination.page - 1) * pagination.limit;
  const take = pagination.limit;

  const [records, total] = await Promise.all([
    orderRepository.findAdminOrders(filters, { skip, take }),
    orderRepository.countAdminOrders(filters),
  ]);

  return {
    items: records.map(toAdminOrderListItem),
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
    },
  };
}

export async function getAdminOrderById(orderId: string): Promise<AdminOrderDetailResponse> {
  const order = await orderRepository.findOrderById(orderId);
  if (!order) {
    throw new NotFoundError("Order not found");
  }

  return toAdminOrderDetailResponse(order);
}

export async function updateOrderStatus(
  orderId: string,
  nextStatus: OrderStatus,
): Promise<AdminOrderDetailResponse> {
  const existingOrder = await orderRepository.findOrderById(orderId);
  if (!existingOrder) {
    throw new NotFoundError("Order not found");
  }

  if (existingOrder.status === nextStatus) {
    return toAdminOrderDetailResponse(existingOrder);
  }

  // Guardrail: Cannot cancel already dispatched or delivered orders
  if (
    nextStatus === OrderStatus.CANCELLED &&
    (existingOrder.status === OrderStatus.SHIPPED || existingOrder.status === OrderStatus.DELIVERED)
  ) {
    throw new AppError(400, "Cannot cancel an order that has already been shipped or delivered");
  }

  const allowedTransitions = VALID_ORDER_STATUS_TRANSITIONS[existingOrder.status] || [];
  if (!allowedTransitions.includes(nextStatus)) {
    throw new AppError(
      400,
      `Cannot transition order status from ${existingOrder.status} to ${nextStatus}. Valid transitions: [${allowedTransitions.join(", ")}]`,
    );
  }

  // Safe cancellation with inventory & refund lifecycle
  if (nextStatus === OrderStatus.CANCELLED) {
    let refundToProcessId: string | null = null;

    await prisma.$transaction(async (tx) => {
      // Row lock to ensure isolation
      const lockedRows = await tx.$queryRaw<Array<{ id: string; status: OrderStatus }>>`
        SELECT id, status FROM orders WHERE id = ${orderId}::uuid FOR UPDATE
      `;
      if (!lockedRows || lockedRows.length === 0) {
        throw new NotFoundError("Order not found");
      }
      const current = lockedRows[0];
      if (!current) throw new NotFoundError("Order not found");
      if (current.status === OrderStatus.CANCELLED) {
        return; // Idempotent no-op
      }

      const items = await tx.orderItem.findMany({
        where: { orderId },
        select: { variantId: true, quantity: true },
      });

      if (current.status === OrderStatus.CONFIRMED) {
        // Order was confirmed: physical stock was committed -> restore committed stock
        await orderRepository.restoreCommittedInventory(items, tx);
      } else if (current.status === OrderStatus.PENDING_PAYMENT) {
        // Order was pending payment: stock was reserved -> release reservation
        await orderRepository.releaseReservedInventory(items, tx);
      }

      // Roll back coupon usage if used on this order
      await orderRepository.rollbackCouponUsage(orderId, tx);

      // Check payments
      const paidPayment = await tx.payment.findFirst({
        where: { orderId, paymentStatus: PaymentStatus.PAID },
      });

      if (paidPayment) {
        if (paidPayment.paymentMethod === PaymentMethod.RAZORPAY) {
          const existingRefund = await tx.refund.findFirst({
            where: { paymentId: paidPayment.id },
          });

          if (!existingRefund) {
            const refundRec = await createRefundRecord(
              {
                orderId,
                paymentId: paidPayment.id,
                amount: existingOrder.totalAmount,
                currency: "INR",
              },
              tx,
            );
            refundToProcessId = refundRec.id;
          } else if (existingRefund.status === "PENDING") {
            refundToProcessId = existingRefund.id;
          }
        } else {
          // COD or other: mark payment CANCELLED
          await tx.payment.update({
            where: { id: paidPayment.id },
            data: { paymentStatus: PaymentStatus.CANCELLED },
          });
        }
      } else {
        // Pending payments: mark CANCELLED
        await tx.payment.updateMany({
          where: { orderId, paymentStatus: PaymentStatus.PENDING },
          data: {
            paymentStatus: PaymentStatus.CANCELLED,
            failureReason: "Order cancelled by administrator",
          },
        });
      }

      // Update order status to CANCELLED and clear expiresAt
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          expiresAt: null,
        },
      });
    });

    // Out-of-transaction: trigger refund processing
    if (refundToProcessId) {
      await processRefund(refundToProcessId);
    }

    const refreshed = await orderRepository.findOrderById(orderId);
    if (!refreshed) {
      throw new NotFoundError("Order not found");
    }
    return toAdminOrderDetailResponse(refreshed);
  }

  const updatedOrder = await orderRepository.updateOrderStatus(orderId, nextStatus);
  return toAdminOrderDetailResponse(updatedOrder);
}

export async function createOrderShipment(
  orderId: string,
  input: CreateShipmentInput,
): Promise<AdminOrderDetailResponse> {
  const order = await orderRepository.findOrderById(orderId);
  if (!order) {
    throw new NotFoundError("Order not found");
  }

  if (order.status === OrderStatus.CANCELLED) {
    throw new AppError(400, "Cannot create a shipment for a cancelled order");
  }

  if (order.status === OrderStatus.PENDING_PAYMENT) {
    throw new AppError(400, "Cannot create a shipment for an order awaiting payment confirmation");
  }

  const existingActiveShipment = await orderRepository.findActiveShipmentByOrderId(orderId);
  if (existingActiveShipment) {
    throw new AppError(
      400,
      "An active shipment already exists for this order. Please update the existing shipment.",
    );
  }

  const status = input.status ?? ShipmentStatus.BOOKED;
  const isShippedStage = (
    [
      ShipmentStatus.BOOKED,
      ShipmentStatus.PICKED_UP,
      ShipmentStatus.IN_TRANSIT,
      ShipmentStatus.OUT_FOR_DELIVERY,
    ] as ShipmentStatus[]
  ).includes(status);

  return orderRepository.runTransaction(async (tx) => {
    await orderRepository.createShipment(
      {
        orderId,
        provider: "SHIPROCKET",
        status,
        trackingNumber: input.trackingNumber,
        providerShipmentId: input.providerShipmentId,
        providerOrderId: input.providerOrderId,
        courierName: input.courierName,
        trackingUrl: input.trackingUrl,
        bookedAt: new Date(),
        shippedAt: isShippedStage ? new Date() : null,
        deliveredAt: status === ShipmentStatus.DELIVERED ? new Date() : null,
      },
      tx,
    );

    if (order.status === OrderStatus.CONFIRMED && isShippedStage) {
      await orderRepository.updateOrderStatus(orderId, OrderStatus.SHIPPED, tx);
    } else if (status === ShipmentStatus.DELIVERED && order.status !== OrderStatus.DELIVERED) {
      await orderRepository.updateOrderStatus(orderId, OrderStatus.DELIVERED, tx);
    }

    const refreshedOrder = await orderRepository.findOrderById(orderId, tx);
    if (!refreshedOrder) {
      throw new AppError(500, "Failed to retrieve order after creating shipment");
    }

    return toAdminOrderDetailResponse(refreshedOrder);
  });
}

export async function updateShipmentStatus(
  orderId: string,
  shipmentId: string,
  nextStatus: ShipmentStatus,
): Promise<AdminOrderDetailResponse> {
  const order = await orderRepository.findOrderById(orderId);
  if (!order) {
    throw new NotFoundError("Order not found");
  }

  const shipment = await orderRepository.findShipmentById(shipmentId);
  if (!shipment || shipment.orderId !== orderId) {
    throw new NotFoundError("Shipment not found for this order");
  }

  if (shipment.status === nextStatus) {
    return toAdminOrderDetailResponse(order);
  }

  const allowedTransitions = VALID_SHIPMENT_STATUS_TRANSITIONS[shipment.status] || [];
  if (!allowedTransitions.includes(nextStatus)) {
    throw new AppError(
      400,
      `Cannot transition shipment status from ${shipment.status} to ${nextStatus}. Valid transitions: [${allowedTransitions.join(", ")}]`,
    );
  }

  return orderRepository.runTransaction(async (tx) => {
    const updateData: Prisma.ShipmentUpdateInput = {
      status: nextStatus,
    };

    if (
      ([ShipmentStatus.PICKED_UP, ShipmentStatus.IN_TRANSIT] as ShipmentStatus[]).includes(nextStatus) &&
      !shipment.shippedAt
    ) {
      updateData.shippedAt = new Date();
    }

    if (nextStatus === ShipmentStatus.DELIVERED) {
      updateData.deliveredAt = new Date();
    }

    await orderRepository.updateShipment(shipmentId, updateData, tx);

    if (
      (
        [
          ShipmentStatus.BOOKED,
          ShipmentStatus.PICKED_UP,
          ShipmentStatus.IN_TRANSIT,
          ShipmentStatus.OUT_FOR_DELIVERY,
        ] as ShipmentStatus[]
      ).includes(nextStatus) &&
      order.status === OrderStatus.CONFIRMED
    ) {
      await orderRepository.updateOrderStatus(orderId, OrderStatus.SHIPPED, tx);
    } else if (nextStatus === ShipmentStatus.DELIVERED && order.status !== OrderStatus.DELIVERED) {
      await orderRepository.updateOrderStatus(orderId, OrderStatus.DELIVERED, tx);
    }

    const refreshedOrder = await orderRepository.findOrderById(orderId, tx);
    if (!refreshedOrder) {
      throw new AppError(500, "Failed to retrieve order after updating shipment status");
    }

    return toAdminOrderDetailResponse(refreshedOrder);
  });
}

export async function updateOrderPaymentStatus(
  orderId: string,
  paymentId: string,
  nextPaymentStatus: PaymentStatus,
): Promise<AdminOrderDetailResponse> {
  const order = await orderRepository.findOrderById(orderId);
  if (!order) {
    throw new NotFoundError("Order not found");
  }

  const payment = order.payments.find((p) => p.id === paymentId);
  if (!payment) {
    throw new NotFoundError("Payment record not found for this order");
  }

  if (payment.paymentStatus === nextPaymentStatus) {
    return toAdminOrderDetailResponse(order);
  }

  await orderRepository.updatePaymentStatus(
    paymentId,
    nextPaymentStatus,
    nextPaymentStatus === PaymentStatus.PAID ? new Date() : null,
  );

  const refreshedOrder = await orderRepository.findOrderById(orderId);
  if (!refreshedOrder) {
    throw new AppError(500, "Failed to retrieve order after updating payment status");
  }

  return toAdminOrderDetailResponse(refreshedOrder);
}
