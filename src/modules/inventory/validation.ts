import { z } from 'zod';

export const inventoryListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  categoryId: z.string().uuid('Invalid category ID').optional(),
  stockStatus: z.enum(['ALL', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']).default('ALL'),
  sortBy: z.enum(['name', 'sku', 'stock', 'availableStock', 'updatedAt', 'price']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const variantIdParamSchema = z.object({
  variantId: z.string().uuid('Invalid variant ID'),
});

export const stockAdjustmentSchema = z
  .object({
    action: z.enum(['ADD', 'REMOVE', 'SET', 'CORRECTION'], {
      required_error: 'Adjustment action is required',
    }),
    quantity: z.coerce.number().int({ message: 'Quantity must be an integer' }),
    reason: z
      .string()
      .trim()
      .min(3, 'Adjustment reason must be at least 3 characters')
      .max(255, 'Adjustment reason cannot exceed 255 characters'),
    notes: z.string().trim().max(500, 'Notes cannot exceed 500 characters').optional(),
  })
  .superRefine((data, ctx) => {
    if ((data.action === 'ADD' || data.action === 'REMOVE') && data.quantity <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantity'],
        message: `Quantity for ${data.action} must be greater than 0`,
      });
    }
    if ((data.action === 'SET' || data.action === 'CORRECTION') && data.quantity < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantity'],
        message: 'Target quantity cannot be negative',
      });
    }
  });

export const updateThresholdSchema = z.object({
  lowStockThreshold: z.coerce
    .number()
    .int('Low stock threshold must be an integer')
    .min(0, 'Low stock threshold cannot be negative')
    .max(100000, 'Low stock threshold is unreasonably large'),
});

export const movementsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  variantId: z.string().uuid('Invalid variant ID').optional(),
  type: z
    .enum([
      'STOCK_RECEIVED',
      'MANUAL_ADJUSTMENT',
      'STOCK_CORRECTION',
      'ORDER_PLACED',
      'ORDER_RESERVED',
      'ORDER_RELEASED',
      'ORDER_CANCELLED',
      'REFUND_RESTOCKED',
    ])
    .optional(),
  search: z.string().trim().max(100).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const updateInventorySettingsSchema = z.object({
  defaultLowStockThreshold: z.coerce
    .number()
    .int('Default threshold must be an integer')
    .min(0, 'Default threshold cannot be negative')
    .max(10000, 'Default threshold cannot exceed 10000'),
});
