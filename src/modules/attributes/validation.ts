import { z } from 'zod';
import { ATTRIBUTE, PAGINATION } from '../../shared/constants/index.js';

const attributeNameSchema = z
  .string({ required_error: 'Attribute name is required' })
  .trim()
  .min(1, 'Attribute name cannot be empty')
  .max(ATTRIBUTE.NAME_MAX, `Attribute name cannot exceed ${ATTRIBUTE.NAME_MAX} characters`);

const attributeValueSchema = z
  .string({ required_error: 'Attribute value is required' })
  .trim()
  .min(1, 'Attribute value cannot be empty')
  .max(ATTRIBUTE.VALUE_MAX, `Attribute value cannot exceed ${ATTRIBUTE.VALUE_MAX} characters`);

const colorCodeSchema = z
  .string()
  .trim()
  .regex(ATTRIBUTE.COLOR_CODE_PATTERN, 'Color code must be a 6-digit hex value such as #164A35')
  .transform((value) => value.toUpperCase());

export const createAttributeSchema = z.object({
  name: attributeNameSchema,
});

export const updateAttributeSchema = z
  .object({
    name: attributeNameSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const attributeIdParamSchema = z.object({
  id: z.string().uuid('Invalid attribute ID format'),
});

export const attributeValueParamsSchema = z.object({
  id: z.string().uuid('Invalid attribute ID format'),
  valueId: z.string().uuid('Invalid attribute value ID format'),
});

export const listAttributesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  search: z.string().trim().max(ATTRIBUTE.SEARCH_MAX).optional(),
});

export const listAttributeValuesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  search: z.string().trim().max(ATTRIBUTE.SEARCH_MAX).optional(),
});

export const createAttributeValueSchema = z.object({
  value: attributeValueSchema,
  colorCode: colorCodeSchema.optional(),
});

export const updateAttributeValueSchema = z
  .object({
    value: attributeValueSchema.optional(),
    colorCode: colorCodeSchema.nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });
