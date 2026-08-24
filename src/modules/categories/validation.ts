import { z } from 'zod';
import { CATEGORY_IMAGE, PAGINATION } from '../../shared/constants/index.js';

const categoryNameSchema = z
  .string({ required_error: 'Category name is required' })
  .trim()
  .min(1, 'Category name cannot be empty')
  .max(100, 'Category name cannot exceed 100 characters');

const categoryDescriptionSchema = z
  .string()
  .trim()
  .max(2000, 'Category description cannot exceed 2000 characters')
  .nullable()
  .optional();

const categoryStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

export const categoryImageKeySchema = z
  .string()
  .regex(
    /^categories\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/,
    'Invalid image key',
  );

export const createCategorySchema = z.object({
  name: categoryNameSchema,
  description: categoryDescriptionSchema,
  status: categoryStatusSchema.optional(),
  imageKey: categoryImageKeySchema.optional(),
});

export const updateCategorySchema = z
  .object({
    name: categoryNameSchema.optional(),
    description: categoryDescriptionSchema,
    status: categoryStatusSchema.optional(),
    imageKey: categoryImageKeySchema.nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const categoryIdParamSchema = z.object({
  id: z.string().uuid('Invalid category ID format'),
});

export const listCategoriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  search: z.string().trim().max(100).optional(),
  status: categoryStatusSchema.optional(),
});

export const uploadUrlSchema = z.object({
  purpose: z.literal(CATEGORY_IMAGE.PURPOSE, {
    errorMap: () => ({ message: 'Upload purpose must be category_image' }),
  }),
  contentType: z
    .string({ required_error: 'Content type is required' })
    .transform((value) => (value === 'image/jpg' ? 'image/jpeg' : value))
    .pipe(
      z.enum(CATEGORY_IMAGE.ALLOWED_MIME_TYPES, {
        errorMap: () => ({
          message: 'Unsupported image type. Allowed types: image/jpeg, image/png, image/webp',
        }),
      }),
    ),
  fileSize: z
    .number({ required_error: 'File size is required' })
    .int('File size must be an integer')
    .positive('File size must be greater than 0')
    .max(CATEGORY_IMAGE.MAX_BYTES, `Image cannot exceed ${CATEGORY_IMAGE.MAX_BYTES} bytes`),
});
