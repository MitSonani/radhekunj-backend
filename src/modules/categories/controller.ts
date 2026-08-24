import { Request, Response } from 'express';
import { CategoryStatus } from '@prisma/client';
import * as categoryService from './service.js';
import { ApiResponse } from '../../shared/types/index.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import type { AllowedImageMimeType } from '../../shared/services/s3.js';

/**
 * Creates a new category.
 */
export async function createCategoryHandler(req: Request, res: Response): Promise<void> {
  const { name, description, status, imageKey } = req.body as {
    name: string;
    description?: string | null;
    status?: CategoryStatus;
    imageKey?: string;
  };

  const category = await categoryService.createCategory({
    name,
    description,
    status,
    imageKey,
  });

  const response: ApiResponse = {
    success: true,
    data: category,
    message: 'Category created successfully',
  };

  res.status(HTTP_STATUS.CREATED).json(response);
}

/**
 * Lists categories with pagination and optional filters.
 */
export async function listCategoriesHandler(req: Request, res: Response): Promise<void> {
  const { page, limit, search, status } = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    status?: CategoryStatus;
  };

  const { categories, pagination } = await categoryService.listCategories({
    page,
    limit,
    search,
    status,
  });

  const response: ApiResponse = {
    success: true,
    data: categories,
    pagination,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

/**
 * Retrieves a category by ID.
 */
export async function getCategoryByIdHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const category = await categoryService.getCategoryById(id);

  const response: ApiResponse = {
    success: true,
    data: category,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

/**
 * Updates an existing category.
 */
export async function updateCategoryHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const { name, description, status, imageKey } = req.body as {
    name?: string;
    description?: string | null;
    status?: CategoryStatus;
    imageKey?: string | null;
  };

  const category = await categoryService.updateCategory(id, {
    name,
    description,
    status,
    imageKey,
  });

  const response: ApiResponse = {
    success: true,
    data: category,
    message: 'Category updated successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

/**
 * Deletes a category.
 */
export async function deleteCategoryHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  await categoryService.deleteCategory(id);

  const response: ApiResponse = {
    success: true,
    message: 'Category deleted successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

/**
 * Issues a presigned S3 upload URL for a category image.
 */
export async function createImageUploadUrlHandler(req: Request, res: Response): Promise<void> {
  const { contentType, fileSize } = req.body as {
    contentType: AllowedImageMimeType;
    fileSize: number;
  };

  const upload = await categoryService.createCategoryImageUploadUrl({
    contentType,
    fileSize,
  });

  const response: ApiResponse = {
    success: true,
    data: upload,
    message: 'Upload URL generated successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}
