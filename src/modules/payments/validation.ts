import { z } from 'zod';

export const createRazorpayOrderSchema = z.object({
  orderId: z.string().uuid('Invalid order ID'),
});

export const verifyRazorpayPaymentSchema = z.object({
  orderId: z.string().uuid('Invalid order ID'),
  razorpayOrderId: z.string().min(1, 'Razorpay Order ID is required'),
  razorpayPaymentId: z.string().min(1, 'Razorpay Payment ID is required'),
  razorpaySignature: z.string().min(1, 'Razorpay Signature is required'),
});

export const orderIdParamSchema = z.object({
  orderId: z.string().uuid('Invalid order ID'),
});
