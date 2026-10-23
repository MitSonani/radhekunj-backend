import { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';

export { PaymentMethod, PaymentStatus };

export interface PaymentResponse {
  id: string;
  orderId: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  amount: string;
  currency: string;
  provider: string | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  paidAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RazorpayOrderPayload {
  keyId: string;
  orderId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
}

export interface VerifyRazorpayPaymentInput {
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface CreatePaymentRecordInput {
  orderId: string;
  paymentMethod: PaymentMethod;
  paymentStatus?: PaymentStatus;
  amount: Prisma.Decimal | number | string;
  currency?: string;
  provider?: string | null;
  providerOrderId?: string | null;
  providerPaymentId?: string | null;
  providerSignature?: string | null;
  paidAt?: Date | null;
  failureReason?: string | null;
  metadata?: Prisma.InputJsonValue;
}
