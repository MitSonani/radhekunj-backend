import crypto from "crypto";
import { Prisma, RefundStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "../../database/prisma.js";
import { appConfig } from "../../config/index.js";
import { logger } from "../../shared/utils/logger.js";
import { AppError, NotFoundError } from "../../shared/errors/appError.js";

export interface CreateRefundInput {
  orderId: string;
  paymentId: string;
  amount: Prisma.Decimal;
  currency?: string;
  reason?: string;
}

export interface RefundRecord {
  id: string;
  orderId: string;
  paymentId: string;
  amount: Prisma.Decimal;
  currency: string;
  status: RefundStatus;
  gatewayRefundId: string | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Creates a refund record in PENDING status inside a database transaction.
 * Does NOT call external payment gateway APIs inside the transaction.
 */
export async function createRefundRecord(
  input: CreateRefundInput,
  tx: Prisma.TransactionClient,
): Promise<RefundRecord> {
  return tx.refund.create({
    data: {
      orderId: input.orderId,
      paymentId: input.paymentId,
      amount: input.amount,
      currency: input.currency ?? "INR",
      status: RefundStatus.PENDING,
    },
  });
}

/**
 * Executes the refund via Razorpay gateway out-of-transaction.
 * Updates the refund entity with PROCESSED or FAILED status and records failure reason.
 */
export async function processRefund(refundId: string): Promise<RefundRecord> {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: {
      payment: true,
      order: true,
    },
  });

  if (!refund) {
    throw new NotFoundError("Refund record not found");
  }

  if (refund.status === RefundStatus.PROCESSED) {
    return refund;
  }

  const payment = refund.payment;
  if (!payment) {
    throw new AppError(400, "Associated payment record not found for refund");
  }

  // For COD payments, gateway refund is not applicable; mark processed directly if created
  if (payment.paymentMethod === "COD") {
    return prisma.refund.update({
      where: { id: refund.id },
      data: {
        status: RefundStatus.PROCESSED,
        gatewayRefundId: `cod_refund_${refund.id.slice(0, 8)}`,
      },
    });
  }

  // Razorpay refund handling
  const keyId = appConfig.razorpay.keyId;
  const keySecret = appConfig.razorpay.keySecret;
  const isMock = !appConfig.isProduction || !keySecret || keySecret.includes("mock") || keySecret === "rzp_test_mock_secret";

  try {
    let gatewayRefundId: string;

    if (isMock) {
      // Deterministic or mock refund id for tests and non-production
      gatewayRefundId = `rfnd_mock_${crypto.randomBytes(8).toString("hex")}`;
    } else {
      if (!payment.providerPaymentId) {
        throw new AppError(400, "Payment providerPaymentId is missing; cannot initiate gateway refund");
      }

      const amountInPaise = Math.round(Number(refund.amount) * 100);
      const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;

      const response = await fetch(`https://api.razorpay.com/v1/payments/${payment.providerPaymentId}/refund`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: amountInPaise,
          notes: {
            orderId: refund.orderId,
            refundId: refund.id,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Razorpay refund API error: ${response.status} - ${errorText}`);
      }

      const rzpData = (await response.json()) as { id: string };
      gatewayRefundId = rzpData.id;
    }

    // Success: Update refund and payment status transactionally
    const updatedRefund = await prisma.$transaction(async (tx) => {
      const rec = await tx.refund.update({
        where: { id: refund.id },
        data: {
          status: RefundStatus.PROCESSED,
          gatewayRefundId,
          failureReason: null,
        },
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          paymentStatus: PaymentStatus.REFUNDED,
        },
      });

      return rec;
    });

    logger.info("Refund processed successfully", {
      refundId: refund.id,
      orderId: refund.orderId,
      gatewayRefundId,
    });

    return updatedRefund;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("Refund processing failed", {
      refundId: refund.id,
      orderId: refund.orderId,
      error: errorMsg,
    });

    // Record failure state on the refund record
    return prisma.refund.update({
      where: { id: refund.id },
      data: {
        status: RefundStatus.FAILED,
        failureReason: errorMsg,
      },
    });
  }
}

/**
 * Allows administrators to retry a failed refund.
 */
export async function retryRefund(orderId: string, refundId: string): Promise<RefundRecord> {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
  });

  if (!refund || refund.orderId !== orderId) {
    throw new NotFoundError("Refund not found for this order");
  }

  if (refund.status === RefundStatus.PROCESSED) {
    throw new AppError(400, "Refund has already been processed successfully");
  }

  // Reset status to PENDING
  await prisma.refund.update({
    where: { id: refundId },
    data: {
      status: RefundStatus.PENDING,
      failureReason: null,
    },
  });

  return processRefund(refundId);
}
