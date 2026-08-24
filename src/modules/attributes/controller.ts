import { Request, Response } from 'express';
import * as attributeService from './service.js';
import { ApiResponse } from '../../shared/types/index.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';

/**
 * Creates a new attribute.
 */
export async function createAttributeHandler(req: Request, res: Response): Promise<void> {
  const { name } = req.body as { name: string };
  const attribute = await attributeService.createAttribute({ name });

  const response: ApiResponse = {
    success: true,
    data: attribute,
    message: 'Attribute created successfully',
  };

  res.status(HTTP_STATUS.CREATED).json(response);
}

/**
 * Lists attributes with pagination and optional search.
 */
export async function listAttributesHandler(req: Request, res: Response): Promise<void> {
  const { page, limit, search } = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
  };

  const { attributes, pagination } = await attributeService.listAttributes({
    page,
    limit,
    search,
  });

  const response: ApiResponse = {
    success: true,
    data: attributes,
    pagination,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

/**
 * Retrieves an attribute by ID.
 */
export async function getAttributeByIdHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const attribute = await attributeService.getAttributeById(id);

  const response: ApiResponse = {
    success: true,
    data: attribute,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

/**
 * Updates an existing attribute.
 */
export async function updateAttributeHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const { name } = req.body as { name?: string };
  const attribute = await attributeService.updateAttribute(id, { name });

  const response: ApiResponse = {
    success: true,
    data: attribute,
    message: 'Attribute updated successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

/**
 * Deletes an attribute when it has no values and is not referenced.
 */
export async function deleteAttributeHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  await attributeService.deleteAttribute(id);

  const response: ApiResponse = {
    success: true,
    message: 'Attribute deleted successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

/**
 * Lists values for an attribute.
 */
export async function listAttributeValuesHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const { page, limit, search } = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
  };

  const { values, pagination } = await attributeService.listAttributeValues(id, {
    page,
    limit,
    search,
  });

  const response: ApiResponse = {
    success: true,
    data: values,
    pagination,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

/**
 * Creates a value for an attribute.
 */
export async function createAttributeValueHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const { value, colorCode } = req.body as { value: string; colorCode?: string };
  const attributeValue = await attributeService.createAttributeValue(id, { value, colorCode });

  const response: ApiResponse = {
    success: true,
    data: attributeValue,
    message: 'Attribute value created successfully',
  };

  res.status(HTTP_STATUS.CREATED).json(response);
}

/**
 * Updates an attribute value.
 */
export async function updateAttributeValueHandler(req: Request, res: Response): Promise<void> {
  const { id, valueId } = req.params as { id: string; valueId: string };
  const { value, colorCode } = req.body as { value?: string; colorCode?: string | null };
  const attributeValue = await attributeService.updateAttributeValue(id, valueId, {
    value,
    colorCode,
  });

  const response: ApiResponse = {
    success: true,
    data: attributeValue,
    message: 'Attribute value updated successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

/**
 * Deletes an attribute value when it is not referenced.
 */
export async function deleteAttributeValueHandler(req: Request, res: Response): Promise<void> {
  const { id, valueId } = req.params as { id: string; valueId: string };
  await attributeService.deleteAttributeValue(id, valueId);

  const response: ApiResponse = {
    success: true,
    message: 'Attribute value deleted successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}
