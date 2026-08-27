import { z } from 'zod';

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
