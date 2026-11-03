import { Request, Response } from 'express';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import type { ApiResponse } from '../../shared/types/index.js';
import * as inventoryService from './service.js';
import type {
  InventoryListFilters,
  StockAdjustmentInput,
  StockMovementFilters,
  StockStatus,
  UpdateThresholdInput,
  InventorySettings,
} from './types.js';
import { InventoryMovementType } from '@prisma/client';

export async function getDashboardHandler(_req: Request, res: Response): Promise<void> {
  const data = await inventoryService.getDashboard();

  const response: ApiResponse = {
    success: true,
    data,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function listInventoryHandler(req: Request, res: Response): Promise<void> {
  const page = typeof req.query['page'] === 'string' ? parseInt(req.query['page'], 10) : 1;
  const limit = typeof req.query['limit'] === 'string' ? parseInt(req.query['limit'], 10) : 20;

  const filters: InventoryListFilters = {
    search: typeof req.query['search'] === 'string' ? req.query['search'] : undefined,
    categoryId: typeof req.query['categoryId'] === 'string' ? req.query['categoryId'] : undefined,
    stockStatus: (req.query['stockStatus'] as StockStatus | 'ALL') || 'ALL',
    sortBy: req.query['sortBy'] as any,
    sortOrder: req.query['sortOrder'] as any,
  };

  const result = await inventoryService.listInventory(filters, page, limit);

  const response: ApiResponse = {
    success: true,
    data: result.items,
    pagination: result.pagination,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function getVariantInventoryHandler(req: Request, res: Response): Promise<void> {
  const variantId = req.params['variantId'] as string;
  const data = await inventoryService.getVariantInventory(variantId);

  const response: ApiResponse = {
    success: true,
    data,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function adjustStockHandler(req: Request, res: Response): Promise<void> {
  const variantId = req.params['variantId'] as string;
  const body = req.body as StockAdjustmentInput;
  const adminId = (req.user as any)?.id as string;

  const result = await inventoryService.adjustStock(variantId, body, adminId);

  const response: ApiResponse = {
    success: true,
    data: result,
    message: 'Stock adjusted successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function updateThresholdHandler(req: Request, res: Response): Promise<void> {
  const variantId = req.params['variantId'] as string;
  const body = req.body as UpdateThresholdInput;

  const result = await inventoryService.updateThreshold(variantId, body);

  const response: ApiResponse = {
    success: true,
    data: result,
    message: 'Low stock threshold updated successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function listMovementsHandler(req: Request, res: Response): Promise<void> {
  const page = typeof req.query['page'] === 'string' ? parseInt(req.query['page'], 10) : 1;
  const limit = typeof req.query['limit'] === 'string' ? parseInt(req.query['limit'], 10) : 20;

  const filters: StockMovementFilters = {
    variantId: typeof req.query['variantId'] === 'string' ? req.query['variantId'] : undefined,
    type: req.query['type'] as InventoryMovementType | undefined,
    search: typeof req.query['search'] === 'string' ? req.query['search'] : undefined,
    startDate: req.query['startDate'] ? new Date(req.query['startDate'] as string) : undefined,
    endDate: req.query['endDate'] ? new Date(req.query['endDate'] as string) : undefined,
  };

  const result = await inventoryService.listMovements(filters, page, limit);

  const response: ApiResponse = {
    success: true,
    data: result.items,
    pagination: result.pagination,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function getSettingsHandler(_req: Request, res: Response): Promise<void> {
  const data = await inventoryService.getSettings();

  const response: ApiResponse = {
    success: true,
    data,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function updateSettingsHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as InventorySettings;
  const data = await inventoryService.updateSettings(body);

  const response: ApiResponse = {
    success: true,
    data,
    message: 'Inventory settings updated successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}
