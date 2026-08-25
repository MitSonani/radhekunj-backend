import { Request, Response } from 'express';
import { ProductStatus } from '@prisma/client';
import * as productService from './service.js';
import { ApiResponse } from '../../shared/types/index.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import type { AllowedImageMimeType } from '../../shared/services/s3.js';

export async function createProductHandler(req: Request, res: Response): Promise<void> {
  const product = await productService.createProduct(req.body as productService.CreateProductInput);

  const response: ApiResponse = {
    success: true,
    data: product,
    message: 'Product created successfully',
  };

  res.status(HTTP_STATUS.CREATED).json(response);
}

export async function listProductsHandler(req: Request, res: Response): Promise<void> {
  const { page, limit, search, status, categoryId, sku } = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    status?: ProductStatus;
    categoryId?: string;
    sku?: string;
  };

  const { products, pagination } = await productService.listProducts({
    page,
    limit,
    search,
    status,
    categoryId,
    sku,
  });

  const response: ApiResponse = {
    success: true,
    data: products,
    pagination,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function getProductByIdHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const product = await productService.getProductById(id);

  const response: ApiResponse = {
    success: true,
    data: product,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function updateProductHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const product = await productService.updateProduct(
    id,
    req.body as productService.UpdateProductInput,
  );

  const response: ApiResponse = {
    success: true,
    data: product,
    message: 'Product updated successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function deactivateProductHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const product = await productService.deactivateProduct(id);

  const response: ApiResponse = {
    success: true,
    data: product,
    message: 'Product deactivated successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function createVariantHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const variant = await productService.createVariant(
    id,
    req.body as productService.CreateVariantInput,
  );

  const response: ApiResponse = {
    success: true,
    data: variant,
    message: 'Variant created successfully',
  };

  res.status(HTTP_STATUS.CREATED).json(response);
}

export async function updateVariantHandler(req: Request, res: Response): Promise<void> {
  const { id, variantId } = req.params as { id: string; variantId: string };
  const variant = await productService.updateVariant(
    id,
    variantId,
    req.body as productService.UpdateVariantInput,
  );

  const response: ApiResponse = {
    success: true,
    data: variant,
    message: 'Variant updated successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function deactivateVariantHandler(req: Request, res: Response): Promise<void> {
  const { id, variantId } = req.params as { id: string; variantId: string };
  const variant = await productService.deactivateVariant(id, variantId);

  const response: ApiResponse = {
    success: true,
    data: variant,
    message: 'Variant deactivated successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function setInventoryHandler(req: Request, res: Response): Promise<void> {
  const { id, variantId } = req.params as { id: string; variantId: string };
  const inventory = await productService.setInventory(
    id,
    variantId,
    req.body as productService.SetInventoryInput,
  );

  const response: ApiResponse = {
    success: true,
    data: inventory,
    message: 'Inventory updated successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function adjustInventoryHandler(req: Request, res: Response): Promise<void> {
  const { id, variantId } = req.params as { id: string; variantId: string };
  const { quantityDelta } = req.body as { quantityDelta: number };
  const inventory = await productService.adjustInventory(id, variantId, quantityDelta);

  const response: ApiResponse = {
    success: true,
    data: inventory,
    message: 'Inventory adjusted successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function createImageUploadUrlHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const { contentType, fileSize, attributeValueId } = req.body as {
    contentType: AllowedImageMimeType;
    fileSize: number;
    attributeValueId?: string;
  };

  const upload = await productService.createProductImageUploadUrl(id, {
    contentType,
    fileSize,
    attributeValueId,
  });

  const response: ApiResponse = {
    success: true,
    data: upload,
    message: 'Upload URL generated successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function createProductImageHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const image = await productService.createProductImage(
    id,
    req.body as productService.CreateProductImageInput,
  );

  const response: ApiResponse = {
    success: true,
    data: image,
    message: 'Product image created successfully',
  };

  res.status(HTTP_STATUS.CREATED).json(response);
}

export async function updateProductImageHandler(req: Request, res: Response): Promise<void> {
  const { id, imageId } = req.params as { id: string; imageId: string };
  const image = await productService.updateProductImage(
    id,
    imageId,
    req.body as productService.UpdateProductImageInput,
  );

  const response: ApiResponse = {
    success: true,
    data: image,
    message: 'Product image updated successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function deleteProductImageHandler(req: Request, res: Response): Promise<void> {
  const { id, imageId } = req.params as { id: string; imageId: string };
  await productService.deleteProductImage(id, imageId);

  const response: ApiResponse = {
    success: true,
    message: 'Product image deleted successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}
