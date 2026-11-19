import { Request, Response } from "express";
import { HTTP_STATUS } from "../../shared/constants/index.js";
import type { ApiResponse } from "../../shared/types/index.js";
import * as customerService from "./service.js";
import type { CustomerAccountStatusFilter, CustomerSortBy, SortOrder } from "./types.js";

export async function listCustomersHandler(req: Request, res: Response): Promise<void> {
  const page = typeof req.query["page"] === "string" ? parseInt(req.query["page"], 10) : Number(req.query["page"]) || 1;
  const limit = typeof req.query["limit"] === "string" ? parseInt(req.query["limit"], 10) : Number(req.query["limit"]) || 20;

  const filters = {
    search: typeof req.query["search"] === "string" ? req.query["search"] : undefined,
    status: req.query["status"] as CustomerAccountStatusFilter | undefined,
    sortBy: req.query["sortBy"] as CustomerSortBy | undefined,
    sortOrder: req.query["sortOrder"] as SortOrder | undefined,
  };

  const result = await customerService.listCustomers(filters, { page, limit });

  const response: ApiResponse = {
    success: true,
    data: result.items,
    pagination: result.pagination,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function getCustomerByIdHandler(req: Request, res: Response): Promise<void> {
  const id = req.params["id"] as string;
  const customer = await customerService.getCustomerById(id);

  const response: ApiResponse = {
    success: true,
    data: customer,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function updateCustomerStatusHandler(req: Request, res: Response): Promise<void> {
  const id = req.params["id"] as string;
  const { isActive } = req.body as { isActive: boolean };
  const adminId = req.user?.id;

  const updated = await customerService.setCustomerStatus(id, isActive, adminId);

  const response: ApiResponse = {
    success: true,
    data: updated,
    message: `Customer account ${isActive ? "activated" : "deactivated"} successfully`,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

