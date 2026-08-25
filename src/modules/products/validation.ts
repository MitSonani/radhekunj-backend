import { z } from 'zod';
import { PAGINATION, PRODUCT, PRODUCT_IMAGE } from '../../shared/constants/index.js';

const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

const productNameSchema = z
  .string({ required_error: 'Product name is required' })
  .trim()
  .min(1, 'Product name cannot be empty')
  .max(PRODUCT.NAME_MAX, `Product name cannot exceed ${PRODUCT.NAME_MAX} characters`);

const productDescriptionSchema = z
  .string()
  .trim()
  .max(
    PRODUCT.DESCRIPTION_MAX,
    `Product description cannot exceed ${PRODUCT.DESCRIPTION_MAX} characters`,
  )
  .nullable()
  .optional();

const productStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
const variantStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

const moneyPattern = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;

const moneySchema = z
  .union([
    z.number({ invalid_type_error: 'Price must be a number or numeric string' }).finite(),
    z.string({ invalid_type_error: 'Price must be a number or numeric string' }).trim(),
  ])
  .refine((value) => moneyPattern.test(typeof value === 'number' ? value.toFixed(2) : value), {
    message: 'Price must be a non-negative amount with up to 2 decimal places',
  })
  .transform((value) => (typeof value === 'number' ? value.toFixed(2) : value));

const optionalMoneySchema = moneySchema.nullable().optional();

const skuSchema = z
  .string({ required_error: 'SKU is required' })
  .trim()
  .min(1, 'SKU cannot be empty')
  .max(PRODUCT.SKU_MAX, `SKU cannot exceed ${PRODUCT.SKU_MAX} characters`)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9\-_]*$/,
    'SKU may contain letters, numbers, hyphens, and underscores',
  );

const attributeValueIdsSchema = z
  .array(z.string().uuid('Invalid attribute value ID format'))
  .max(20, 'A variant cannot have more than 20 attributes');

const inventoryInputSchema = z
  .object({
    quantity: z
      .number({ required_error: 'Quantity is required' })
      .int('Quantity must be an integer')
      .min(0, 'Quantity cannot be negative'),
    reservedQuantity: z
      .number()
      .int('Reserved quantity must be an integer')
      .min(0, 'Reserved quantity cannot be negative')
      .optional(),
  })
  .refine((data) => (data.reservedQuantity ?? 0) <= data.quantity, {
    message: 'Reserved quantity cannot exceed quantity',
    path: ['reservedQuantity'],
  });

const altTextSchema = z
  .string()
  .trim()
  .max(PRODUCT.ALT_TEXT_MAX, `Alt text cannot exceed ${PRODUCT.ALT_TEXT_MAX} characters`)
  .nullable()
  .optional();

export const productImageKeySchema = z
  .string()
  .regex(
    new RegExp(
      `^products/${UUID_PATTERN}(?:/colors/${UUID_PATTERN})?/${UUID_PATTERN}\\.(jpg|png|webp)$`,
    ),
    'Invalid image key',
  );

const createVariantBodySchema = z.object({
  sku: skuSchema,
  price: moneySchema,
  compareAtPrice: optionalMoneySchema,
  status: variantStatusSchema.optional(),
  attributeValueIds: attributeValueIdsSchema.default([]),
  inventory: inventoryInputSchema.default({ quantity: 0 }),
});

export const createProductSchema = z.object({
  categoryId: z.string().uuid('Invalid category ID format'),
  name: productNameSchema,
  description: productDescriptionSchema,
  basePrice: moneySchema,
  status: productStatusSchema.optional(),
  variants: z.array(createVariantBodySchema).max(100).optional(),
});

export const updateProductSchema = z
  .object({
    categoryId: z.string().uuid('Invalid category ID format').optional(),
    name: productNameSchema.optional(),
    description: productDescriptionSchema,
    basePrice: moneySchema.optional(),
    status: productStatusSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const createVariantSchema = createVariantBodySchema;

export const updateVariantSchema = z
  .object({
    sku: skuSchema.optional(),
    price: moneySchema.optional(),
    compareAtPrice: optionalMoneySchema,
    status: variantStatusSchema.optional(),
    attributeValueIds: attributeValueIdsSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const setInventorySchema = z
  .object({
    quantity: z
      .number()
      .int('Quantity must be an integer')
      .min(0, 'Quantity cannot be negative')
      .optional(),
    reservedQuantity: z
      .number()
      .int('Reserved quantity must be an integer')
      .min(0, 'Reserved quantity cannot be negative')
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  })
  .refine(
    (data) =>
      data.quantity === undefined ||
      data.reservedQuantity === undefined ||
      data.reservedQuantity <= data.quantity,
    {
      message: 'Reserved quantity cannot exceed quantity',
      path: ['reservedQuantity'],
    },
  );

export const adjustInventorySchema = z.object({
  quantityDelta: z
    .number({ required_error: 'Quantity delta is required' })
    .int('Quantity delta must be an integer')
    .refine((value) => value !== 0, { message: 'Quantity delta cannot be 0' }),
});

export const createProductImageSchema = z.object({
  objectKey: productImageKeySchema,
  attributeValueId: z.string().uuid('Invalid attribute value ID format').nullable().optional(),
  altText: altTextSchema,
  sortOrder: z.number().int().min(0, 'Sort order cannot be negative').optional(),
  isPrimary: z.boolean().optional(),
});

export const updateProductImageSchema = z
  .object({
    objectKey: productImageKeySchema.optional(),
    attributeValueId: z.string().uuid('Invalid attribute value ID format').nullable().optional(),
    altText: altTextSchema,
    sortOrder: z.number().int().min(0, 'Sort order cannot be negative').optional(),
    isPrimary: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const productImageUploadUrlSchema = z.object({
  purpose: z.literal(PRODUCT_IMAGE.PURPOSE, {
    errorMap: () => ({ message: 'Upload purpose must be product_image' }),
  }),
  contentType: z
    .string({ required_error: 'Content type is required' })
    .transform((value) => (value === 'image/jpg' ? 'image/jpeg' : value))
    .pipe(
      z.enum(PRODUCT_IMAGE.ALLOWED_MIME_TYPES, {
        errorMap: () => ({
          message: 'Unsupported image type. Allowed types: image/jpeg, image/png, image/webp',
        }),
      }),
    ),
  fileSize: z
    .number({ required_error: 'File size is required' })
    .int('File size must be an integer')
    .positive('File size must be greater than 0')
    .max(PRODUCT_IMAGE.MAX_BYTES, `Image cannot exceed ${PRODUCT_IMAGE.MAX_BYTES} bytes`),
  attributeValueId: z.string().uuid('Invalid attribute value ID format').optional(),
});

export const productIdParamSchema = z.object({
  id: z.string().uuid('Invalid product ID format'),
});

export const productVariantParamsSchema = z.object({
  id: z.string().uuid('Invalid product ID format'),
  variantId: z.string().uuid('Invalid variant ID format'),
});

export const productImageParamsSchema = z.object({
  id: z.string().uuid('Invalid product ID format'),
  imageId: z.string().uuid('Invalid image ID format'),
});

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  search: z.string().trim().max(PRODUCT.SEARCH_MAX).optional(),
  status: productStatusSchema.optional(),
  categoryId: z.string().uuid('Invalid category ID format').optional(),
  sku: z.string().trim().max(PRODUCT.SKU_MAX).optional(),
});
