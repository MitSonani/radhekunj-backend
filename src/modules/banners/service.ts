import { prisma } from '../../database/prisma.js';
import { NotFoundError } from '../../shared/errors/index.js';
import {
  buildBannerImageKey,
  createPresignedUploadUrl,
  deleteObjectIfExists,
  type PresignedUploadResult,
} from '../../shared/services/s3.js';
import { BANNER_IMAGE } from '../../shared/constants/index.js';
import type { CreateBannerInput, UpdateBannerInput, BannerUploadUrlInput } from './types.js';

export async function getActiveBanners() {
  return prisma.banner.findMany({
    where: { isActive: true },
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'desc' },
    ],
  });
}

export async function listAllBanners() {
  return prisma.banner.findMany({
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'desc' },
    ],
  });
}

export async function getBannerById(id: string) {
  const banner = await prisma.banner.findUnique({
    where: { id },
  });

  if (!banner) {
    throw new NotFoundError('Banner not found');
  }

  return banner;
}

export async function createBanner(input: CreateBannerInput) {
  return prisma.banner.create({
    data: {
      title: input.title,
      subtitle: input.subtitle ?? null,
      badgeText: input.badgeText ?? null,
      ctaLabel: input.ctaLabel ?? null,
      ctaLink: input.ctaLink ?? null,
      desktopImageUrl: input.desktopImageUrl,
      tabletImageUrl: input.tabletImageUrl ?? null,
      mobileImageUrl: input.mobileImageUrl ?? null,
      desktopImageKey: input.desktopImageKey ?? null,
      tabletImageKey: input.tabletImageKey ?? null,
      mobileImageKey: input.mobileImageKey ?? null,
      altText: input.altText,
      textAlignment: input.textAlignment ?? 'left',
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function updateBanner(id: string, input: UpdateBannerInput) {
  await getBannerById(id);

  return prisma.banner.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.subtitle !== undefined ? { subtitle: input.subtitle } : {}),
      ...(input.badgeText !== undefined ? { badgeText: input.badgeText } : {}),
      ...(input.ctaLabel !== undefined ? { ctaLabel: input.ctaLabel } : {}),
      ...(input.ctaLink !== undefined ? { ctaLink: input.ctaLink } : {}),
      ...(input.desktopImageUrl !== undefined ? { desktopImageUrl: input.desktopImageUrl } : {}),
      ...(input.tabletImageUrl !== undefined ? { tabletImageUrl: input.tabletImageUrl } : {}),
      ...(input.mobileImageUrl !== undefined ? { mobileImageUrl: input.mobileImageUrl } : {}),
      ...(input.desktopImageKey !== undefined ? { desktopImageKey: input.desktopImageKey } : {}),
      ...(input.tabletImageKey !== undefined ? { tabletImageKey: input.tabletImageKey } : {}),
      ...(input.mobileImageKey !== undefined ? { mobileImageKey: input.mobileImageKey } : {}),
      ...(input.altText !== undefined ? { altText: input.altText } : {}),
      ...(input.textAlignment !== undefined ? { textAlignment: input.textAlignment } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
}

export async function deleteBanner(id: string) {
  const existing = await getBannerById(id);

  // Clean up any managed S3 image keys in background if present
  if (existing.desktopImageKey) {
    void Promise.resolve(deleteObjectIfExists(existing.desktopImageKey)).catch(() => {});
  }
  if (existing.tabletImageKey) {
    void Promise.resolve(deleteObjectIfExists(existing.tabletImageKey)).catch(() => {});
  }
  if (existing.mobileImageKey) {
    void Promise.resolve(deleteObjectIfExists(existing.mobileImageKey)).catch(() => {});
  }

  return prisma.banner.delete({
    where: { id },
  });
}

export async function createBannerUploadUrl(input: BannerUploadUrlInput): Promise<PresignedUploadResult> {
  const objectKey = buildBannerImageKey(input.device, input.contentType);
  return createPresignedUploadUrl({
    contentType: input.contentType,
    fileSize: input.fileSize,
    objectKey,
    expiresIn: BANNER_IMAGE.PRESIGNED_URL_EXPIRES_IN,
  });
}
