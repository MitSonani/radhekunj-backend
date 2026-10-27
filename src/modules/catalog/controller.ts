import { Request, Response } from 'express';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import type { ApiResponse } from '../../shared/types/index.js';
import * as catalogService from './service.js';
import type { PublicProductSort } from './repository.js';

export async function listPublicProductsHandler(req: Request, res: Response): Promise<void> {
  const { page, limit, search, categorySlug, sort, minPrice, maxPrice, color, size, inStock } =
    req.query as unknown as {
      page: number;
      limit: number;
      search?: string;
      categorySlug?: string;
      sort: PublicProductSort;
      minPrice?: number;
      maxPrice?: number;
      color?: string;
      size?: string;
      inStock?: boolean;
    };

  const { products, pagination } = await catalogService.listPublicProducts({
    page,
    limit,
    search,
    categorySlug,
    sort,
    minPrice,
    maxPrice,
    color,
    size,
    inStock,
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


export async function getFilterOptionsHandler(_req: Request, res: Response): Promise<void> {
  const options = await catalogService.getCatalogFilterOptions();

  const response: ApiResponse = {
    success: true,
    data: options,
  };

  res.status(HTTP_STATUS.OK).json(response);
}
