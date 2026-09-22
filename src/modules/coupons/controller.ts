import { Request, Response } from 'express';
import {
  CouponDiscountType,
  CouponScope,
  CouponStatus,
} from '@prisma/client';
import * as adminCouponService from './adminService.js';
import type { CouponValidity } from './adminService.js';
import { ApiResponse } from '../../shared/types/index.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';

export async function createCouponHandler(req: Request, res: Response): Promise<void> {
  const coupon = await adminCouponService.createCoupon(
    req.body as adminCouponService.CreateCouponInput,
  );

  const response: ApiResponse = {
    success: true,
    data: coupon,
    message: 'Coupon created successfully',
  };

  res.status(HTTP_STATUS.CREATED).json(response);
}

export async function listCouponsHandler(req: Request, res: Response): Promise<void> {
  const { page, limit, search, status, discountType, scope, validity } = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    status?: CouponStatus;
    discountType?: CouponDiscountType;
    scope?: CouponScope;
    validity?: CouponValidity;
  };

  const { coupons, pagination } = await adminCouponService.listCoupons({
    page,
    limit,
    search,
    status,
    discountType,
    scope,
    validity,
  });

  const response: ApiResponse = {
    success: true,
    data: coupons,
    pagination,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function getCouponByIdHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const coupon = await adminCouponService.getCouponById(id);

  const response: ApiResponse = {
    success: true,
    data: coupon,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function updateCouponHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const coupon = await adminCouponService.updateCoupon(
    id,
    req.body as adminCouponService.UpdateCouponInput,
  );

  const response: ApiResponse = {
    success: true,
    data: coupon,
    message: 'Coupon updated successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function activateCouponHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const coupon = await adminCouponService.activateCoupon(id);

  const response: ApiResponse = {
    success: true,
    data: coupon,
    message: 'Coupon activated successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function deactivateCouponHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const coupon = await adminCouponService.deactivateCoupon(id);

  const response: ApiResponse = {
    success: true,
    data: coupon,
    message: 'Coupon deactivated successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function archiveCouponHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const coupon = await adminCouponService.archiveCoupon(id);

  const response: ApiResponse = {
    success: true,
    data: coupon,
    message: 'Coupon archived successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function listCouponUsagesHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const { page, limit } = req.query as unknown as { page: number; limit: number };

  const { usages, pagination } = await adminCouponService.listCouponUsages(id, page, limit);

  const response: ApiResponse = {
    success: true,
    data: usages,
    pagination,
  };

  res.status(HTTP_STATUS.OK).json(response);
}
