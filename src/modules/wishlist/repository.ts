import { Prisma, ProductVariantStatus } from '@prisma/client';
import { prisma } from '../../database/prisma.js';

// ---------------------------------------------------------------------------
// Select shapes
// ---------------------------------------------------------------------------

const wishlistProductImageSelect = {
  id: true,
  objectKey: true,
  altText: true,
  isPrimary: true,
} satisfies Prisma.ProductImageSelect;

const wishlistProductVariantSelect = {
  price: true,
  compareAtPrice: true,
  inventory: {
    select: {
      quantity: true,
      reservedQuantity: true,
    },
  },
} satisfies Prisma.ProductVariantSelect;

const wishlistProductSelect = {
  id: true,
  name: true,
  slug: true,
  basePrice: true,
  status: true,
  images: {
    orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
    take: 1,
    select: wishlistProductImageSelect,
  },
  variants: {
    where: { status: ProductVariantStatus.ACTIVE },
    select: wishlistProductVariantSelect,
  },
} satisfies Prisma.ProductSelect;

const wishlistItemSelect = {
  id: true,
  productId: true,
  createdAt: true,
  product: {
    select: wishlistProductSelect,
  },
} satisfies Prisma.WishlistItemSelect;

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type WishlistItemRecord = Prisma.WishlistItemGetPayload<{
  select: typeof wishlistItemSelect;
}>;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function findWishlistItemByUserAndProduct(
  userId: string,
  productId: string,
): Promise<{ id: string; createdAt: Date } | null> {
  return prisma.wishlistItem.findUnique({
    where: { userId_productId: { userId, productId } },
    select: { id: true, createdAt: true },
  });
}

/**
 * Attempts to create a WishlistItem.
 * Returns the created record, or null when the unique constraint fires
 * (race condition where the same user/product pair was inserted concurrently).
 */
export async function createWishlistItem(
  userId: string,
  productId: string,
): Promise<{ id: string; createdAt: Date } | null> {
  try {
    return await prisma.wishlistItem.create({
      data: { userId, productId },
      select: { id: true, createdAt: true },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      // Unique constraint violation: concurrent request already inserted the row.
      return null;
    }

    throw error;
  }
}

/**
 * Deletes a WishlistItem by userId + productId.
 * Returns true when deleted, false when the row did not exist.
 */
export async function deleteWishlistItem(
  userId: string,
  productId: string,
): Promise<boolean> {
  try {
    await prisma.wishlistItem.delete({
      where: { userId_productId: { userId, productId } },
    });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      return false;
    }

    throw error;
  }
}

export async function findUserWishlist(userId: string): Promise<WishlistItemRecord[]> {
  return prisma.wishlistItem.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: wishlistItemSelect,
  });
}

export async function countUserWishlist(userId: string): Promise<number> {
  return prisma.wishlistItem.count({ where: { userId } });
}

export async function wishlistItemExistsForUser(
  userId: string,
  productId: string,
): Promise<boolean> {
  const count = await prisma.wishlistItem.count({
    where: { userId, productId },
  });
  return count > 0;
}
