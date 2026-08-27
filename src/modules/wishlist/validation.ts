import { z } from 'zod';

export const addToWishlistSchema = z.object({
  productId: z
    .string({ required_error: 'productId is required' })
    .uuid('Invalid product ID format'),
});

export const wishlistProductParamSchema = z.object({
  productId: z.string().uuid('Invalid product ID format'),
});
