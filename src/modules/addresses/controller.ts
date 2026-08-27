import { Request, Response } from 'express';
import { AppError } from '../../shared/errors/appError.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import type { ApiResponse } from '../../shared/types/index.js';
import * as addressService from './service.js';

function requireAuthUser(req: Request): string {
  if (!req.user) {
    throw new AppError(401, 'Authentication required');
  }

  return req.user.id;
}

export async function createAddressHandler(req: Request, res: Response): Promise<void> {
  const userId = requireAuthUser(req);
  const address = await addressService.createAddress(
    userId,
    req.body as addressService.CreateAddressInput,
  );

  const response: ApiResponse = {
    success: true,
    data: address,
    message: 'Address created successfully',
  };

  res.status(HTTP_STATUS.CREATED).json(response);
}

export async function getAddressesHandler(req: Request, res: Response): Promise<void> {
  const userId = requireAuthUser(req);
  const result = await addressService.getAddresses(userId);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function getAddressByIdHandler(req: Request, res: Response): Promise<void> {
  const userId = requireAuthUser(req);
  const { id } = req.params as { id: string };
  const address = await addressService.getAddressById(userId, id);

  const response: ApiResponse = {
    success: true,
    data: address,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function updateAddressHandler(req: Request, res: Response): Promise<void> {
  const userId = requireAuthUser(req);
  const { id } = req.params as { id: string };
  const address = await addressService.updateAddress(
    userId,
    id,
    req.body as addressService.UpdateAddressInput,
  );

  const response: ApiResponse = {
    success: true,
    data: address,
    message: 'Address updated successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function setDefaultAddressHandler(req: Request, res: Response): Promise<void> {
  const userId = requireAuthUser(req);
  const { id } = req.params as { id: string };
  const address = await addressService.setDefaultAddress(userId, id);

  const response: ApiResponse = {
    success: true,
    data: address,
    message: 'Default address updated',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function deleteAddressHandler(req: Request, res: Response): Promise<void> {
  const userId = requireAuthUser(req);
  const { id } = req.params as { id: string };

  await addressService.deleteAddress(userId, id);

  const response: ApiResponse = {
    success: true,
    message: 'Address deleted successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}
