import { Queue, Worker, Job } from "bullmq";
import { Redis } from "ioredis";
import { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma.js";
import { env } from "../../config/env.js";
import { logger } from "../../shared/utils/logger.js";
import * as orderRepository from "./repository.js";

const ORDER_EXPIRY_QUEUE_NAME = "order-expiry-queue";

let orderExpiryQueue: Queue | null = null;
let orderExpiryWorker: Worker | null = null;

function createBullRedisConnection(): Redis | null {
  if (!env.REDIS_URL) {
    return null;
  }
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
}

const queueConnection = createBullRedisConnection();
if (queueConnection) {
  orderExpiryQueue = new Queue(ORDER_EXPIRY_QUEUE_NAME, {
    connection: queueConnection,
  });
}

/**
 * Schedules a delayed job to expire a pending payment order after 15 minutes.
 */
export async function scheduleOrderExpiry(
  orderId: string,
  delayMs: number = 15 * 60 * 1000,
): Promise<void> {
  if (!orderExpiryQueue) {
    logger.info("Order expiry queue not configured; relying on reconciliation", { orderId });
    return;
  }

  try {
    await orderExpiryQueue.add(
      "expire_order",
      { orderId },
      {
        jobId: `expire_order_${orderId}`,
        delay: delayMs,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    logger.info("Scheduled order expiry job", { orderId, delayMs });
  } catch (error) {
    logger.error("Failed to schedule order expiry job", {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Transactionally expires an order if it is still in PENDING_PAYMENT status
 * and payment has not been captured. Releases reserved inventory and rolls back coupon usage.
 */
export async function expireOrderIfPending(orderId: string): Promise<{
  expired: boolean;
  reason?: string;
}> {
  return prisma.$transaction(async (tx) => {
    // 1. Lock the order row exclusively to prevent race conditions with payment capture
    const lockedRows = await tx.$queryRaw<Array<{ id: string; status: OrderStatus; expires_at: Date | null }>>`
      SELECT id, status, expires_at FROM orders WHERE id = ${orderId}::uuid FOR UPDATE
    `;

    if (!lockedRows || lockedRows.length === 0) {
      return { expired: false, reason: "ORDER_NOT_FOUND" };
    }

    const orderRow = lockedRows[0];
    if (!orderRow || orderRow.status !== OrderStatus.PENDING_PAYMENT) {
      return { expired: false, reason: `ALREADY_${orderRow.status}` };
    }

    // 2. Double-check payment status under transaction: never cancel if payment was already captured
    const paidPayment = await tx.payment.findFirst({
      where: {
        orderId,
        paymentStatus: PaymentStatus.PAID,
      },
    });

    if (paidPayment) {
      logger.warn("Order expiry skipped: payment already marked PAID", { orderId, paymentId: paidPayment.id });
      return { expired: false, reason: "PAYMENT_ALREADY_CAPTURED" };
    }

    // 3. Load order items to release reservations
    const items = await tx.orderItem.findMany({
      where: { orderId },
      select: { variantId: true, quantity: true },
    });

    // 4. Release reserved inventory atomically
    for (const item of items) {
      await tx.inventory.update({
        where: { variantId: item.variantId },
        data: {
          reservedQuantity: { decrement: item.quantity },
        },
      });
    }

    // 5. Roll back coupon usage if applicable
    const couponUsage = await tx.couponUsage.findFirst({
      where: { orderId },
    });
    if (couponUsage) {
      await tx.couponUsage.delete({
        where: { id: couponUsage.id },
      });
      logger.info("Rolled back coupon usage on expired order", { orderId, couponId: couponUsage.couponId });
    }

    // 6. Mark order CANCELLED and clear expiresAt
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
        expiresAt: null,
      },
    });

    // 7. Mark any pending payments as CANCELLED
    await tx.payment.updateMany({
      where: {
        orderId,
        paymentStatus: PaymentStatus.PENDING,
      },
      data: {
        paymentStatus: PaymentStatus.CANCELLED,
        failureReason: "Payment window expired (15 minutes limit)",
      },
    });

    logger.info("Order expired successfully; inventory reservations released", { orderId });
    return { expired: true };
  });
}

/**
 * Scheduled reconciliation job that finds and expires orphaned PENDING_PAYMENT orders
 * in case a delayed BullMQ job was lost or missed due to worker downtime.
 */
export async function reconcileExpiredOrders(): Promise<number> {
  const now = new Date();
  const expiredOrders = await prisma.order.findMany({
    where: {
      status: OrderStatus.PENDING_PAYMENT,
      expiresAt: {
        lte: now,
      },
    },
    select: { id: true },
  });

  if (expiredOrders.length === 0) {
    return 0;
  }

  logger.info(`Reconciling ${expiredOrders.length} expired orders`);
  let reconciledCount = 0;

  for (const order of expiredOrders) {
    try {
      const result = await expireOrderIfPending(order.id);
      if (result.expired) {
        reconciledCount++;
      }
    } catch (err) {
      logger.error("Failed to reconcile expired order", {
        orderId: order.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return reconciledCount;
}

/**
 * Starts the BullMQ worker for order expiration.
 */
export function startOrderExpiryWorker(): void {
  if (!env.REDIS_URL || orderExpiryWorker) {
    return;
  }

  const workerConnection = createBullRedisConnection();
  if (!workerConnection) return;

  orderExpiryWorker = new Worker(
    ORDER_EXPIRY_QUEUE_NAME,
    async (job: Job) => {
      const { orderId } = job.data as { orderId: string };
      logger.info("Processing order expiry job", { orderId, jobId: job.id });
      await expireOrderIfPending(orderId);
    },
    {
      connection: workerConnection,
    },
  );

  orderExpiryWorker.on("completed", (job) => {
    logger.info(`Order expiry job completed: ${job.id}`);
  });

  orderExpiryWorker.on("failed", (job, err) => {
    logger.error(`Order expiry job failed: ${job?.id}`, { error: err.message });
  });

  logger.info("Order expiry worker started");
}

export async function stopOrderExpiryWorker(): Promise<void> {
  if (orderExpiryWorker) {
    await orderExpiryWorker.close();
    orderExpiryWorker = null;
    logger.info("Order expiry worker stopped");
  }
}
