import { Request, Response } from 'express';
import { AppError } from '../../shared/errors/appError.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import type { ApiResponse } from '../../shared/types/index.js';
import * as wishlistService from './service.js';

function requireAuthUser(req: Request): string {
  if (!req.user) {
    throw new AppError(401, 'Authentication required');
  }

  return req.user.id;
}

export async function getWishlistHandler(req: Request, res: Response): Promise<void> {
  const userId = requireAuthUser(req);
  const wishlist = await wishlistService.getWishlist(userId);

  const response: ApiResponse = {
    success: true,
    data: wishlist,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function addToWishlistHandler(req: Request, res: Response): Promise<void> {
  const userId = requireAuthUser(req);
  const result = await wishlistService.addToWishlist(
    userId,
    req.body as wishlistService.AddToWishlistInput,
  );

  const response: ApiResponse = {
    success: true,
    data: {
      id: result.id,
      productId: result.productId,
      createdAt: result.createdAt,
    },
    message: result.alreadyWishlisted
      ? 'Product is already in your wishlist'
      : 'Product added to wishlist',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function removeFromWishlistHandler(req: Request, res: Response): Promise<void> {
  const userId = requireAuthUser(req);
  const { productId } = req.params as { productId: string };

  await wishlistService.removeFromWishlist(userId, productId);

  const response: ApiResponse = {
    success: true,
    message: 'Product removed from wishlist',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function checkWishlistStatusHandler(req: Request, res: Response): Promise<void> {
  const userId = requireAuthUser(req);
  const { productId } = req.params as { productId: string };

  const status = await wishlistService.checkWishlistStatus(userId, productId);

  const response: ApiResponse = {
    success: true,
    data: status,
  };

  res.status(HTTP_STATUS.OK).json(response);
}
