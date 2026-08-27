import { Request, Response } from 'express';
import { AppError } from '../../shared/errors/appError.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import type { ApiResponse } from '../../shared/types/index.js';
import * as cartService from './service.js';

function requireAuthUser(req: Request): string {
  if (!req.user) {
    throw new AppError(401, 'Authentication required');
  }

  return req.user.id;
}

export async function getCartHandler(req: Request, res: Response): Promise<void> {
  const userId = requireAuthUser(req);
  const cart = await cartService.getCart(userId);

  const response: ApiResponse = {
    success: true,
    data: cart,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function addToCartHandler(req: Request, res: Response): Promise<void> {
  const userId = requireAuthUser(req);
  const cart = await cartService.addToCart(userId, req.body as cartService.AddToCartInput);

  const response: ApiResponse = {
    success: true,
    data: cart,
    message: 'Item added to cart',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function updateCartItemHandler(req: Request, res: Response): Promise<void> {
  const userId = requireAuthUser(req);
  const { cartItemId } = req.params as { cartItemId: string };
  const cart = await cartService.updateCartItem(userId, cartItemId, req.body as cartService.UpdateCartItemInput);

  const response: ApiResponse = {
    success: true,
    data: cart,
    message: 'Cart item updated',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function removeCartItemHandler(req: Request, res: Response): Promise<void> {
  const userId = requireAuthUser(req);
  const { cartItemId } = req.params as { cartItemId: string };
  const cart = await cartService.removeCartItem(userId, cartItemId);

  const response: ApiResponse = {
    success: true,
    data: cart,
    message: 'Cart item removed',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function clearCartHandler(req: Request, res: Response): Promise<void> {
  const userId = requireAuthUser(req);
  const cart = await cartService.clearCart(userId);

  const response: ApiResponse = {
    success: true,
    data: cart,
    message: 'Cart cleared',
  };

  res.status(HTTP_STATUS.OK).json(response);
}
