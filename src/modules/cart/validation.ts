import { z } from 'zod';
import { COUPON } from '../../shared/constants/index.js';

export const addToCartSchema = z.object({
  variantId: z.string({ required_error: 'variantId is required' }).uuid('Invalid variant ID format'),
  quantity: z
    .number({ required_error: 'quantity is required', invalid_type_error: 'quantity must be a number' })
    .int('quantity must be an integer')
    .min(1, 'quantity must be at least 1'),
});

export const updateCartItemSchema = z.object({
  quantity: z
    .number({ required_error: 'quantity is required', invalid_type_error: 'quantity must be a number' })
    .int('quantity must be an integer')
    .min(1, 'quantity must be at least 1'),
});

export const cartItemParamSchema = z.object({
  cartItemId: z.string().uuid('Invalid cart item ID format'),
});

export const applyCouponSchema = z.object({
  code: z
    .string({ required_error: 'code is required' })
    .trim()
    .min(1, 'code is required')
    .max(COUPON.CODE_MAX, `code must be at most ${COUPON.CODE_MAX} characters`),
});
