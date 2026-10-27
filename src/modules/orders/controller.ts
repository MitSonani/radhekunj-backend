import { checkCodEligibility } from '../financial/service.js';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { AppError } from '../../shared/errors/appError.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import type { ApiResponse } from '../../shared/types/index.js';
import type { PlaceOrderInput } from './types.js';
import * as orderService from './service.js';

function requireAuthUser(req: Request): string {
  if (!req.user) {
    throw new AppError(401, 'Authentication required');
  }

  return req.user.id;
}

export async function placeOrderHandler(req: Request, res: Response): Promise<void> {
  const userId = requireAuthUser(req);
  const order = await orderService.placeOrder(
    userId,
    req.body as PlaceOrderInput,
  );

  const response: ApiResponse = {
    success: true,
    data: order,
    message: 'Order placed successfully',
  };

  res.status(HTTP_STATUS.CREATED).json(response);
}

export async function getUserOrdersHandler(req: Request, res: Response): Promise<void> {
  const userId = requireAuthUser(req);
  const page = typeof req.query['page'] === 'string' ? parseInt(req.query['page'], 10) : 1;
  const limit = typeof req.query['limit'] === 'string' ? parseInt(req.query['limit'], 10) : 20;

  const result = await orderService.getUserOrders(userId, { page, limit });

  const response: ApiResponse = {
    success: true,
    data: result.items,
    pagination: result.pagination,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function getUserOrderByIdHandler(req: Request, res: Response): Promise<void> {
  const userId = requireAuthUser(req);
  const { id } = req.params as { id: string };
  const order = await orderService.getUserOrderById(userId, id);

  const response: ApiResponse = {
    success: true,
    data: order,
  };

  res.status(HTTP_STATUS.OK).json(response);
}


export async function getCodEligibilityHandler(req: Request, res: Response): Promise<void> {
  const amountStr = req.query['amount'] as string | undefined;
  const postalCode = req.query['postalCode'] as string | undefined;

  const totalAmount = amountStr ? new Prisma.Decimal(amountStr) : new Prisma.Decimal(0);
  const result = await checkCodEligibility({ totalAmount, postalCode });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: result,
  });
}
