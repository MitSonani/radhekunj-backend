import { prisma } from '../../database/prisma.js';
import { Payment, Prisma } from '@prisma/client';
import type { CreatePaymentRecordInput } from './types.js';

export async function createPayment(
  data: CreatePaymentRecordInput,
  tx?: Prisma.TransactionClient,
): Promise<Payment> {
  const client = tx ?? prisma;
  return client.payment.create({
    data: {
      orderId: data.orderId,
      paymentMethod: data.paymentMethod,
      paymentStatus: data.paymentStatus ?? 'PENDING',
      amount: new Prisma.Decimal(data.amount),
      currency: data.currency ?? 'INR',
      provider: data.provider ?? null,
      providerOrderId: data.providerOrderId ?? null,
      providerPaymentId: data.providerPaymentId ?? null,
      providerSignature: data.providerSignature ?? null,
      paidAt: data.paidAt ?? null,
      failureReason: data.failureReason ?? null,
      metadata: data.metadata ?? Prisma.JsonNull,
    },
  });
}

export async function findPaymentById(
  id: string,
  tx?: Prisma.TransactionClient,
): Promise<Payment | null> {
  const client = tx ?? prisma;
  return client.payment.findUnique({
    where: { id },
  });
}

export async function findPaymentByProviderOrderId(
  providerOrderId: string,
  tx?: Prisma.TransactionClient,
): Promise<Payment | null> {
  const client = tx ?? prisma;
  return client.payment.findFirst({
    where: { providerOrderId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function findPaymentByProviderPaymentId(
  providerPaymentId: string,
  tx?: Prisma.TransactionClient,
): Promise<Payment | null> {
  const client = tx ?? prisma;
  return client.payment.findUnique({
    where: { providerPaymentId },
  });
}

export async function findLatestPaymentForOrder(
  orderId: string,
  tx?: Prisma.TransactionClient,
): Promise<Payment | null> {
  const client = tx ?? prisma;
  return client.payment.findFirst({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function findPaymentsForOrder(
  orderId: string,
  tx?: Prisma.TransactionClient,
): Promise<Payment[]> {
  const client = tx ?? prisma;
  return client.payment.findMany({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function updatePayment(
  id: string,
  data: Prisma.PaymentUpdateInput,
  tx?: Prisma.TransactionClient,
): Promise<Payment> {
  const client = tx ?? prisma;
  return client.payment.update({
    where: { id },
    data,
  });
}
