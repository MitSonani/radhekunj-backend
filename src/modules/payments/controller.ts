import { Request, Response } from 'express';
import { AppError } from '../../shared/errors/appError.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import type { ApiResponse } from '../../shared/types/index.js';
import type { VerifyRazorpayPaymentInput } from './types.js';
import * as paymentService from './service.js';
import * as paymentRepository from './repository.js';
import * as orderRepository from '../orders/repository.js';

function requireAuthUser(req: Request): string {
  if (!req.user) {
    throw new AppError(401, 'Authentication required');
  }
  return req.user.id;
}

export async function createRazorpayOrderHandler(req: Request, res: Response): Promise<void> {
  const userId = requireAuthUser(req);
  const { orderId } = req.body as { orderId: string };

  const payload = await paymentService.createRazorpayOrder(userId, orderId);

  const response: ApiResponse = {
    success: true,
    data: payload,
    message: 'Razorpay order created successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function verifyRazorpayPaymentHandler(req: Request, res: Response): Promise<void> {
  const userId = requireAuthUser(req);
  const input = req.body as VerifyRazorpayPaymentInput;

  const payment = await paymentService.verifyRazorpayPayment(userId, input);

  const response: ApiResponse = {
    success: true,
    data: payment,
    message: 'Payment verified successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function getPaymentsForOrderHandler(req: Request, res: Response): Promise<void> {
  const userId = requireAuthUser(req);
  const { orderId } = req.params as { orderId: string };

  const order = await orderRepository.findUserOrderById(userId, orderId);
  if (!order) {
    throw new AppError(404, 'Order not found');
  }

  const payments = await paymentRepository.findPaymentsForOrder(orderId);

  const response: ApiResponse = {
    success: true,
    data: payments.map(paymentService.toPaymentResponse),
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function razorpayWebhookHandler(req: Request, res: Response): Promise<void> {
  const signature = req.headers['x-razorpay-signature'] as string;
  if (!signature) {
    throw new AppError(400, 'Missing x-razorpay-signature header');
  }

  // Use rawBody string if available or JSON.stringify(req.body)
  const rawBody =
    typeof (req as unknown as { rawBody?: string }).rawBody === 'string'
      ? (req as unknown as { rawBody: string }).rawBody
      : JSON.stringify(req.body);

  const result = await paymentService.handleRazorpayWebhook(rawBody, signature);

  res.status(HTTP_STATUS.OK).json({ success: true, ...result });
}
