import { z } from 'zod';
import { BANNER_IMAGE } from '../../shared/constants/index.js';

export const bannerUploadUrlSchema = z.object({
  device: z.enum(['desktop', 'tablet', 'mobile']),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(BANNER_IMAGE.MAX_BYTES, `File size exceeds ${BANNER_IMAGE.MAX_BYTES / (1024 * 1024)}MB limit`),
});

export const createBannerSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(255, 'Title cannot exceed 255 characters'),
  subtitle: z.string().trim().max(500, 'Subtitle cannot exceed 500 characters').nullable().optional(),
  badgeText: z.string().trim().max(100, 'Badge text cannot exceed 100 characters').nullable().optional(),
  ctaLabel: z.string().trim().max(100, 'CTA label cannot exceed 100 characters').nullable().optional(),
  ctaLink: z.string().trim().max(500, 'CTA link cannot exceed 500 characters').nullable().optional(),
  desktopImageUrl: z.string().trim().min(1, 'Desktop image URL is required').max(1000),
  tabletImageUrl: z.string().trim().max(1000).nullable().optional(),
  mobileImageUrl: z.string().trim().max(1000).nullable().optional(),
  desktopImageKey: z.string().trim().max(500).nullable().optional(),
  tabletImageKey: z.string().trim().max(500).nullable().optional(),
  mobileImageKey: z.string().trim().max(500).nullable().optional(),
  altText: z.string().trim().min(1, 'Alt text is required for accessibility').max(255),
  textAlignment: z.enum(['left', 'center', 'right']).optional().default('left'),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

export const updateBannerSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    subtitle: z.string().trim().max(500).nullable().optional(),
    badgeText: z.string().trim().max(100).nullable().optional(),
    ctaLabel: z.string().trim().max(100).nullable().optional(),
    ctaLink: z.string().trim().max(500).nullable().optional(),
    desktopImageUrl: z.string().trim().min(1).max(1000).optional(),
    tabletImageUrl: z.string().trim().max(1000).nullable().optional(),
    mobileImageUrl: z.string().trim().max(1000).nullable().optional(),
    desktopImageKey: z.string().trim().max(500).nullable().optional(),
    tabletImageKey: z.string().trim().max(500).nullable().optional(),
    mobileImageKey: z.string().trim().max(500).nullable().optional(),
    altText: z.string().trim().min(1).max(255).optional(),
    textAlignment: z.enum(['left', 'center', 'right']).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export const bannerIdParamSchema = z.object({
  id: z.string().uuid('Invalid banner ID format'),
});
