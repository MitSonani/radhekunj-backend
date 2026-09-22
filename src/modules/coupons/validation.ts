import { z } from 'zod';
import { COUPON, PAGINATION } from '../../shared/constants/index.js';
import { normalizeCode } from './service.js';

const moneyPattern = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;

const moneySchema = z
  .union([
    z.number({ invalid_type_error: 'Amount must be a number or numeric string' }).finite(),
    z.string({ invalid_type_error: 'Amount must be a number or numeric string' }).trim(),
  ])
  .refine((value) => moneyPattern.test(typeof value === 'number' ? value.toFixed(2) : value), {
    message: 'Amount must be a non-negative value with up to 2 decimal places',
  })
  .transform((value) => (typeof value === 'number' ? value.toFixed(2) : value));

const optionalNullableMoneySchema = moneySchema.nullable().optional();

const couponCodeSchema = z
  .string({ required_error: 'code is required' })
  .trim()
  .min(1, 'code is required')
  .max(COUPON.CODE_MAX, `code must be at most ${COUPON.CODE_MAX} characters`)
  .transform((value) => normalizeCode(value))
  .refine((value) => value.length >= COUPON.CODE_MIN, {
    message: `code must be at least ${COUPON.CODE_MIN} characters`,
  })
  .refine((value) => COUPON.CODE_PATTERN.test(value), {
    message: 'code may contain letters, numbers, and hyphens only',
  });

const isoDateSchema = z.coerce.date({
  required_error: 'Date is required',
  invalid_type_error: 'Date must be a valid ISO 8601 datetime',
});

const usageLimitSchema = z
  .number({ invalid_type_error: 'usageLimit must be an integer' })
  .int('usageLimit must be an integer')
  .min(1, 'usageLimit must be at least 1')
  .nullable();

const perUserLimitSchema = z
  .number({ invalid_type_error: 'perUserLimit must be an integer' })
  .int('perUserLimit must be an integer')
  .min(1, 'perUserLimit must be at least 1')
  .nullable();

const uniqueIdArray = (label: string) =>
  z
    .array(z.string().uuid(`Invalid ${label} ID format`))
    .min(1, `At least one ${label} ID is required`)
    .max(COUPON.MAX_MAPPINGS, `A coupon cannot target more than ${COUPON.MAX_MAPPINGS} ${label}s`)
    .superRefine((ids, ctx) => {
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate ${label} IDs are not allowed`,
        });
      }
    });

const productIdsSchema = uniqueIdArray('product');
const categoryIdsSchema = uniqueIdArray('category');

const couponBaseSchema = z.object({
  code: couponCodeSchema,
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT'], {
    errorMap: () => ({ message: 'discountType must be PERCENTAGE or FIXED_AMOUNT' }),
  }),
  discountValue: moneySchema,
  minimumCartValue: optionalNullableMoneySchema,
  maximumDiscount: optionalNullableMoneySchema,
  startsAt: isoDateSchema,
  expiresAt: isoDateSchema,
  usageLimit: usageLimitSchema.optional(),
  perUserLimit: perUserLimitSchema.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

function refineCouponDatesAndDiscount(
  data: {
    discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
    discountValue: string;
    minimumCartValue?: string | null;
    maximumDiscount?: string | null;
    startsAt: Date;
    expiresAt: Date;
  },
  ctx: z.RefinementCtx,
): void {
  const discount = Number(data.discountValue);
  if (!(discount > 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'discountValue must be greater than 0',
      path: ['discountValue'],
    });
  }

  if (data.discountType === 'PERCENTAGE' && discount > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Percentage discountValue cannot exceed 100',
      path: ['discountValue'],
    });
  }

  if (data.minimumCartValue != null && Number(data.minimumCartValue) < 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'minimumCartValue cannot be negative',
      path: ['minimumCartValue'],
    });
  }

  if (data.maximumDiscount != null && !(Number(data.maximumDiscount) > 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'maximumDiscount must be greater than 0',
      path: ['maximumDiscount'],
    });
  }

  if (data.startsAt >= data.expiresAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'startsAt must be before expiresAt',
      path: ['expiresAt'],
    });
  }
}

export const createCouponSchema = z
  .discriminatedUnion('scope', [
    couponBaseSchema.extend({ scope: z.literal('CART') }).strict(),
    couponBaseSchema
      .extend({
        scope: z.literal('PRODUCT'),
        productIds: productIdsSchema,
      })
      .strict(),
    couponBaseSchema
      .extend({
        scope: z.literal('CATEGORY'),
        categoryIds: categoryIdsSchema,
      })
      .strict(),
  ])
  .superRefine((data, ctx) => {
    refineCouponDatesAndDiscount(data, ctx);
  });

export const updateCouponSchema = z
  .object({
    code: couponCodeSchema.optional(),
    discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).optional(),
    discountValue: moneySchema.optional(),
    scope: z.enum(['CART', 'PRODUCT', 'CATEGORY']).optional(),
    minimumCartValue: optionalNullableMoneySchema,
    maximumDiscount: optionalNullableMoneySchema,
    startsAt: isoDateSchema.optional(),
    expiresAt: isoDateSchema.optional(),
    usageLimit: usageLimitSchema.optional(),
    perUserLimit: perUserLimitSchema.optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    productIds: productIdsSchema.optional(),
    categoryIds: categoryIdsSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  })
  .superRefine((data, ctx) => {
    if (data.discountValue !== undefined) {
      const discount = Number(data.discountValue);
      if (!(discount > 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'discountValue must be greater than 0',
          path: ['discountValue'],
        });
      }
      if (data.discountType === 'PERCENTAGE' && discount > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Percentage discountValue cannot exceed 100',
          path: ['discountValue'],
        });
      }
    }

    if (data.minimumCartValue != null && Number(data.minimumCartValue) < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'minimumCartValue cannot be negative',
        path: ['minimumCartValue'],
      });
    }

    if (data.maximumDiscount != null && !(Number(data.maximumDiscount) > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'maximumDiscount must be greater than 0',
        path: ['maximumDiscount'],
      });
    }

    if (data.startsAt && data.expiresAt && data.startsAt >= data.expiresAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'startsAt must be before expiresAt',
        path: ['expiresAt'],
      });
    }

    if (data.scope === 'CART' && (data.productIds !== undefined || data.categoryIds !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CART coupons cannot include productIds or categoryIds',
        path: data.productIds !== undefined ? ['productIds'] : ['categoryIds'],
      });
    }

    if (data.scope === 'PRODUCT' && data.categoryIds !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'PRODUCT coupons cannot include categoryIds',
        path: ['categoryIds'],
      });
    }

    if (data.scope === 'CATEGORY' && data.productIds !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CATEGORY coupons cannot include productIds',
        path: ['productIds'],
      });
    }
  });

export const couponIdParamSchema = z.object({
  id: z.string().uuid('Invalid coupon ID format'),
});

export const listCouponsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  search: z.string().trim().max(COUPON.SEARCH_MAX).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).optional(),
  scope: z.enum(['CART', 'PRODUCT', 'CATEGORY']).optional(),
  validity: z.enum(['CURRENT', 'UPCOMING', 'EXPIRED']).optional(),
});

export const listCouponUsagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});
