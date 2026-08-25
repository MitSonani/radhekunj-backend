import { Request, Response } from 'express';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import type { ApiResponse } from '../../shared/types/index.js';
import * as catalogService from './service.js';
import type { PublicProductSort } from './repository.js';

export async function listPublicProductsHandler(req: Request, res: Response): Promise<void> {
  const { page, limit, search, categorySlug, sort } = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    categorySlug?: string;
    sort: PublicProductSort;
  };

  const { products, pagination } = await catalogService.listPublicProducts({
    page,
    limit,
    search,
    categorySlug,
    sort,
  });

  const response: ApiResponse = {
    success: true,
    data: products,
    pagination,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function getPublicProductBySlugHandler(req: Request, res: Response): Promise<void> {
  const { slug } = req.params as { slug: string };
  const product = await catalogService.getPublicProductBySlug(slug);

  const response: ApiResponse = {
    success: true,
    data: product,
  };

  res.status(HTTP_STATUS.OK).json(response);
}
