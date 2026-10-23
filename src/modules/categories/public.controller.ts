import { Request, Response } from "express";
import { HTTP_STATUS } from "../../shared/constants/index.js";
import type { ApiResponse } from "../../shared/types/index.js";
import * as categoryService from "./service.js";

export async function listPublicCategoriesHandler(req: Request, res: Response): Promise<void> {
  const page = req.query["page"] ? Number(req.query["page"]) : 1;
  const limit = req.query["limit"] ? Number(req.query["limit"]) : 50;
  const search = typeof req.query["search"] === "string" ? req.query["search"] : undefined;

  const { categories, pagination } = await categoryService.listPublicCategories(page, limit, search);

  const response: ApiResponse = {
    success: true,
    data: categories,
    pagination,
  };

  res.status(HTTP_STATUS.OK).json(response);
}
