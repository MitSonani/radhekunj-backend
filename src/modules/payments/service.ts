import crypto from 'crypto';
import { Payment, PaymentMethod, PaymentStatus, OrderStatus, RefundStatus, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { AppError, NotFoundError } from '../../shared/errors/appError.js';
import { env } from '../../config/env.js';
import { appConfig } from '../../config/index.js';
import * as paymentRepository from './repository.js';
import * as orderRepository from '../orders/repository.js';
import { createRefundRecord, processRefund } from './refundService.js';
import type {
  PaymentResponse,
  RazorpayOrderPayload,
  VerifyRazorpayPaymentInput,
} from './types.js';

export function toPaymentResponse(record: Payment): PaymentResponse {
  return {
    id: record.id,
    orderId: record.orderId,
    paymentMethod: record.paymentMethod,
    paymentStatus: record.paymentStatus,
    amount: record.amount.toFixed(2),
    currency: record.currency,
    provider: record.provider,
    providerOrderId: record.providerOrderId,
    providerPaymentId: record.providerPaymentId,
    paidAt: record.paidAt,
    failureReason: record.failureReason,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Creates an initial COD Payment record within an order placement transaction.
 */
export async function createCodPayment(
  orderId: string,
  amount: Prisma.Decimal,
  tx?: Prisma.TransactionClient,
): Promise<Payment> {
  return paymentRepository.createPayment(
    {
      orderId,
      paymentMethod: PaymentMethod.COD,
      paymentStatus: PaymentStatus.PENDING,
      amount,
      currency: 'INR',
      provider: 'MANUAL',
    },
    tx,
  );
}

/**
 * Creates or retrieves a Razorpay Order for an existing pending customer order.
 */
export async function createRazorpayOrder(
  userId: string,
  orderId: string,
): Promise<RazorpayOrderPayload> {
  if (appConfig.isProduction && (!appConfig.razorpay.keyId || !appConfig.razorpay.keySecret || appConfig.razorpay.keyId.includes('mock'))) {
    throw new AppError(500, 'Razorpay payment gateway is not configured for production');
  }

  const order = await orderRepository.findUserOrderById(userId, orderId);
  if (!order) {
    throw new NotFoundError('Order not found');
  }

  // Check if order is already paid/confirmed
  const existingPayments = await paymentRepository.findPaymentsForOrder(orderId);
  const paidPayment = existingPayments.find((p) => p.paymentStatus === PaymentStatus.PAID);
  if (paidPayment) {
    throw new AppError(409, 'This order has already been paid');
  }

  const amountInPaise = Math.round(order.totalAmount.toNumber() * 100);
  const keyId = appConfig.razorpay.keyId || 'rzp_test_mock_key';
  const keySecret = appConfig.razorpay.keySecret || 'rzp_test_mock_secret';

  let razorpayOrderId: string;

  // If Razorpay API credentials are provided and not in test-mock mode, call Razorpay API
  if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && !env.RAZORPAY_KEY_ID.includes('mock')) {
    try {
      const basicAuth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${basicAuth}`,
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency: 'INR',
          receipt: order.orderNumber,
          notes: {
            orderId: order.id,
            userId: order.userId,
          },
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new AppError(502, `Razorpay order creation failed: ${errBody}`);
      }

      const rzpData = (await response.json()) as { id: string };
      razorpayOrderId = rzpData.id;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(502, 'Unable to connect to payment provider. Please try again.');
    }
  } else {
    // Development / Test mode fallback
    razorpayOrderId = `order_${crypto.randomBytes(8).toString('hex')}`;
  }

  // Create a pending Payment record for this attempt
  await paymentRepository.createPayment({
    orderId: order.id,
    paymentMethod: PaymentMethod.RAZORPAY,
    paymentStatus: PaymentStatus.PENDING,
    amount: order.totalAmount,
    currency: 'INR',
    provider: 'RAZORPAY',
    providerOrderId: razorpayOrderId,
  });

  return {
    keyId,
    orderId: order.id,
    razorpayOrderId,
    amount: amountInPaise,
    currency: 'INR',
  };
}

/**
 * Cryptographically verifies Razorpay payment signature and updates payment/order status.
 */
export async function verifyRazorpayPayment(
  userId: string,
  input: VerifyRazorpayPaymentInput,
): Promise<PaymentResponse> {
  if (appConfig.isProduction && (!appConfig.razorpay.keySecret || appConfig.razorpay.keySecret.includes('mock'))) {
    throw new AppError(500, 'Razorpay payment gateway is not configured for production');
  }

  const order = await orderRepository.findUserOrderById(userId, input.orderId);
  if (!order) {
    throw new NotFoundError('Order not found');
  }

  // Idempotency: Check if this payment_id was already verified and marked PAID
  const existingPayment = await paymentRepository.findPaymentByProviderPaymentId(
    input.razorpayPaymentId,
  );
  if (existingPayment && existingPayment.paymentStatus === PaymentStatus.PAID) {
    return toPaymentResponse(existingPayment);
  }

  // Verify HMAC SHA-256 signature
  const keySecret = appConfig.razorpay.keySecret || 'rzp_test_mock_secret';
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedSignature, 'utf-8');
  const actualBuf = Buffer.from(input.razorpaySignature, 'utf-8');
  const isSignatureValid =
    expectedBuf.length === actualBuf.length &&
    crypto.timingSafeEqual(expectedBuf, actualBuf);

  if (!isSignatureValid) {
    // Record payment failure
    await paymentRepository.createPayment({
      orderId: order.id,
      paymentMethod: PaymentMethod.RAZORPAY,
      paymentStatus: PaymentStatus.FAILED,
      amount: order.totalAmount,
      currency: 'INR',
      provider: 'RAZORPAY',
      providerOrderId: input.razorpayOrderId,
      providerPaymentId: input.razorpayPaymentId,
      failureReason: 'Cryptographic signature verification failed',
    });

    throw new AppError(400, 'Invalid payment signature');
  }

  let refundIdToProcess: string | null = null;

  // Execute atomic update in transaction
  const updatedPayment = await prisma.$transaction(async (tx) => {
    // Find pending payment for this providerOrderId
    let targetPayment = await tx.payment.findFirst({
      where: {
        orderId: order.id,
        providerOrderId: input.razorpayOrderId,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (targetPayment) {
      targetPayment = await tx.payment.update({
        where: { id: targetPayment.id },
        data: {
          paymentStatus: PaymentStatus.PAID,
          providerPaymentId: input.razorpayPaymentId,
          providerSignature: input.razorpaySignature,
          paidAt: new Date(),
          failureReason: null,
        },
      });
    } else {
      targetPayment = await tx.payment.create({
        data: {
          orderId: order.id,
          paymentMethod: PaymentMethod.RAZORPAY,
          paymentStatus: PaymentStatus.PAID,
          amount: order.totalAmount,
          currency: 'INR',
          provider: 'RAZORPAY',
          providerOrderId: input.razorpayOrderId,
          providerPaymentId: input.razorpayPaymentId,
          providerSignature: input.razorpaySignature,
          paidAt: new Date(),
        },
      });
    }

    // Row-lock the order to prevent race conditions with expiration worker
    const lockedRows = await tx.$queryRaw<Array<{ id: string; status: OrderStatus }>>`
      SELECT id, status FROM orders WHERE id = ${order.id}::uuid FOR UPDATE
    `;
    const orderRow = lockedRows[0];

    // Idempotency: if already confirmed, do not commit stock twice
    if (orderRow && orderRow.status === OrderStatus.CONFIRMED) {
      return targetPayment;
    }

    if (orderRow && orderRow.status === OrderStatus.CANCELLED) {
      // Race condition: payment captured after order was cancelled/expired.
      // Do NOT commit stock. Create pending refund record for automated gateway refund.
      const existingRefund = await tx.refund.findFirst({
        where: { paymentId: targetPayment.id },
      });
      if (!existingRefund) {
        const refundRec = await createRefundRecord(
          {
            orderId: order.id,
            paymentId: targetPayment.id,
            amount: order.totalAmount,
            currency: "INR",
            reason: "Order cancelled or expired before payment confirmation",
          },
          tx,
        );
        refundIdToProcess = refundRec.id;
      } else if (existingRefund.status === RefundStatus.PENDING) {
        refundIdToProcess = existingRefund.id;
      }
      return targetPayment;
    }

    if (orderRow && orderRow.status === OrderStatus.PENDING_PAYMENT) {
      const items = await tx.orderItem.findMany({
        where: { orderId: order.id },
        select: { variantId: true, quantity: true },
      });
      // Atomically convert reservation into committed stock
      await orderRepository.commitReservedInventory(items, tx);

      // Update order status to CONFIRMED and clear expiresAt
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.CONFIRMED,
          expiresAt: null,
        },
      });
    }

    return targetPayment;
  });

  if (refundIdToProcess) {
    await processRefund(refundIdToProcess);
    throw new AppError(400, "Order expired before payment was confirmed. An automatic refund has been initiated.");
  }

  return toPaymentResponse(updatedPayment);
}

/**
 * Handles Razorpay server-to-server webhook events.
 */
export async function handleRazorpayWebhook(
  rawBody: string,
  signatureHeader: string,
): Promise<{ received: boolean }> {
  if (appConfig.isProduction && !appConfig.razorpay.webhookSecret && !appConfig.razorpay.keySecret) {
    throw new AppError(500, 'Razorpay webhook secret is not configured for production');
  }

  const webhookSecret = appConfig.razorpay.webhookSecret || appConfig.razorpay.keySecret || 'rzp_test_mock_secret';

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  const isSignatureValid = crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'utf-8'),
    Buffer.from(signatureHeader, 'utf-8'),
  );

  if (!isSignatureValid) {
    throw new AppError(400, 'Invalid webhook signature');
  }

  const event = JSON.parse(rawBody) as {
    event: string;
    payload?: {
      payment?: {
        entity?: {
          id: string;
          order_id: string;
          amount: number;
          status: string;
          notes?: { orderId?: string };
        };
      };
    };
  };

  if (event.event === 'payment.captured' || event.event === 'order.paid') {
    const paymentEntity = event.payload?.payment?.entity;
    if (paymentEntity?.id && paymentEntity?.order_id) {
      const providerPaymentId = paymentEntity.id;
      const providerOrderId = paymentEntity.order_id;
      const orderIdNote = paymentEntity.notes?.orderId;

      // Idempotency check: see if payment is already marked PAID
      const existing = await paymentRepository.findPaymentByProviderPaymentId(providerPaymentId);
      if (existing && existing.paymentStatus === PaymentStatus.PAID) {
        return { received: true };
      }

      let refundIdToProcess: string | null = null;

      await prisma.$transaction(async (tx) => {
        const paymentRecord = await tx.payment.findFirst({
          where: { providerOrderId },
          orderBy: { createdAt: 'desc' },
        });

        if (paymentRecord) {
          await tx.payment.update({
            where: { id: paymentRecord.id },
            data: {
              paymentStatus: PaymentStatus.PAID,
              providerPaymentId,
              paidAt: new Date(),
            },
          });

          const lockedRows = await tx.$queryRaw<Array<{ id: string; status: OrderStatus }>>`
            SELECT id, status FROM orders WHERE id = ${paymentRecord.orderId}::uuid FOR UPDATE
          `;
          const orderRow = lockedRows[0];
          if (orderRow && orderRow.status === OrderStatus.PENDING_PAYMENT) {
            const items = await tx.orderItem.findMany({
              where: { orderId: paymentRecord.orderId },
              select: { variantId: true, quantity: true },
            });
            await orderRepository.commitReservedInventory(items, tx);
            await tx.order.update({
              where: { id: paymentRecord.orderId },
              data: { status: OrderStatus.CONFIRMED, expiresAt: null },
            });
          } else if (orderRow && orderRow.status === OrderStatus.CANCELLED) {
            const existingRefund = await tx.refund.findFirst({
              where: { paymentId: paymentRecord.id },
            });
            if (!existingRefund) {
              const refundRec = await createRefundRecord(
                {
                  orderId: paymentRecord.orderId,
                  paymentId: paymentRecord.id,
                  amount: paymentRecord.amount,
                  currency: paymentRecord.currency,
                  reason: "Order cancelled or expired before payment capture webhook",
                },
                tx,
              );
              refundIdToProcess = refundRec.id;
            } else if (existingRefund.status === RefundStatus.PENDING) {
              refundIdToProcess = existingRefund.id;
            }
          }
        } else if (orderIdNote) {
          const order = await tx.order.findUnique({ where: { id: orderIdNote } });
          if (order) {
            const createdPayment = await tx.payment.create({
              data: {
                orderId: order.id,
                paymentMethod: PaymentMethod.RAZORPAY,
                paymentStatus: PaymentStatus.PAID,
                amount: order.totalAmount,
                currency: 'INR',
                provider: 'RAZORPAY',
                providerOrderId,
                providerPaymentId,
                paidAt: new Date(),
              },
            });

            const lockedRows = await tx.$queryRaw<Array<{ id: string; status: OrderStatus }>>`
              SELECT id, status FROM orders WHERE id = ${order.id}::uuid FOR UPDATE
            `;
            const orderRow = lockedRows[0];
            if (orderRow && orderRow.status === OrderStatus.PENDING_PAYMENT) {
              const items = await tx.orderItem.findMany({
                where: { orderId: order.id },
                select: { variantId: true, quantity: true },
              });
              await orderRepository.commitReservedInventory(items, tx);
              await tx.order.update({
                where: { id: order.id },
                data: { status: OrderStatus.CONFIRMED, expiresAt: null },
              });
            } else if (orderRow && orderRow.status === OrderStatus.CANCELLED) {
              const refundRec = await createRefundRecord(
                {
                  orderId: order.id,
                  paymentId: createdPayment.id,
                  amount: order.totalAmount,
                  currency: "INR",
                  reason: "Order cancelled or expired before payment capture webhook",
                },
                tx,
              );
              refundIdToProcess = refundRec.id;
            }
          }
        }
      });

      if (refundIdToProcess) {
        await processRefund(refundIdToProcess);
      }
    }
  }

  if (event.event === "payment.failed") {
    const paymentEntity = event.payload?.payment?.entity;
    if (paymentEntity?.order_id) {
      const providerOrderId = paymentEntity.order_id;
      const errorDescription =
        (paymentEntity as { error_description?: string }).error_description ||
        "Payment failed at gateway";
      await prisma.payment.updateMany({
        where: {
          providerOrderId,
          paymentStatus: PaymentStatus.PENDING,
        },
        data: {
          paymentStatus: PaymentStatus.FAILED,
          failureReason: errorDescription,
        },
      });
    }
  }

  return { received: true };
}
