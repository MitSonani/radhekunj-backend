import { z } from 'zod';
import { PAGINATION, PRODUCT } from '../../shared/constants/index.js';

const CATALOG_SORT_VALUES = ['newest', 'price_asc', 'price_desc'] as const;

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const listPublicProductsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(PAGINATION.MAX_LIMIT)
      .default(PAGINATION.DEFAULT_LIMIT),
    search: z.string().trim().max(PRODUCT.SEARCH_MAX).optional(),
    categorySlug: z
      .string()
      .trim()
      .regex(slugPattern, 'Invalid category slug format')
      .optional(),
    sort: z.enum(CATALOG_SORT_VALUES).default('newest'),
    minPrice: z.coerce.number().min(0, 'minPrice must be non-negative').optional(),
    maxPrice: z.coerce.number().min(0, 'maxPrice must be non-negative').optional(),
    color: z.string().trim().max(50).optional(),
    size: z.string().trim().max(50).optional(),
    inStock: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
      .optional(),
  })
  .refine(
    (data) => {
      if (data.minPrice !== undefined && data.maxPrice !== undefined) {
        return data.minPrice <= data.maxPrice;
      }
      return true;
    },
    {
      message: 'minPrice cannot be greater than maxPrice',
      path: ['minPrice'],
    },
  );

export const publicProductSlugParamSchema = z.object({
  slug: z.string().trim().min(1, 'Product slug is required').max(120),
});
