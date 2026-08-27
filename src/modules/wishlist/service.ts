import { Prisma, ProductStatus } from '@prisma/client';
import { AppError, NotFoundError } from '../../shared/errors/appError.js';
import { buildPublicUrl } from '../../shared/services/s3.js';
import { prisma } from '../../database/prisma.js';
import * as wishlistRepository from './repository.js';
import type { WishlistItemRecord } from './repository.js';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export type WishlistProductImageResponse = {
  id: string;
  url: string;
  altText: string | null;
};

export type WishlistItemProductResponse = {
  id: string;
  name: string;
  slug: string;
  /** Authoritative base price from the product record. */
  price: string;
  /**
   * Lowest compareAtPrice from active variants, or null when no discount exists.
   * Allows the User Panel to display a strikethrough "was" price.
   */
  compareAtPrice: string | null;
  /** First/primary product image, or null when no images exist. */
  primaryImage: WishlistProductImageResponse | null;
  /**
   * true when: product is ACTIVE and at least one ACTIVE variant has available
   * stock (quantity - reservedQuantity > 0).
   */
  isAvailable: boolean;
  status: ProductStatus;
};

export type WishlistItemResponse = {
  id: string;
  productId: string;
  product: WishlistItemProductResponse;
  createdAt: Date;
};

export type WishlistResponse = {
  items: WishlistItemResponse[];
  /** Total number of items in the wishlist (including out-of-stock products). */
  count: number;
};

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export type AddToWishlistInput = {
  productId: string;
};

export type AddToWishlistResult = {
  /** Wishlist item id and createdAt returned to the client. */
  id: string;
  productId: string;
  createdAt: Date;
  /** false on first add, true when the item was already wishlisted. */
  alreadyWishlisted: boolean;
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatMoney(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

/**
 * Computes the minimum compareAtPrice among the provided active variants.
 * Returns null when no variant has a compareAtPrice set.
 */
function computeMinCompareAtPrice(
  variants: WishlistItemRecord['product']['variants'],
): string | null {
  let min: Prisma.Decimal | null = null;

  for (const variant of variants) {
    if (variant.compareAtPrice !== null) {
      if (min === null || variant.compareAtPrice.lessThan(min)) {
        min = variant.compareAtPrice;
      }
    }
  }

  return min !== null ? min.toFixed(2) : null;
}

/**
 * Product availability for wishlist display:
 * - Product must be ACTIVE.
 * - At least one ACTIVE variant must have available stock (quantity - reservedQuantity > 0).
 *
 * Out-of-stock products remain wishlisted but report isAvailable = false.
 */
function computeIsAvailable(
  productStatus: ProductStatus,
  activeVariants: WishlistItemRecord['product']['variants'],
): boolean {
  if (productStatus !== ProductStatus.ACTIVE) {
    return false;
  }

  return activeVariants.some((v) => {
    const available = (v.inventory?.quantity ?? 0) - (v.inventory?.reservedQuantity ?? 0);
    return available > 0;
  });
}

function toWishlistItemResponse(record: WishlistItemRecord): WishlistItemResponse {
  const { product } = record;

  const primaryImageRecord = product.images[0] ?? null;
  const primaryImage: WishlistProductImageResponse | null = primaryImageRecord
    ? {
        id: primaryImageRecord.id,
        url: buildPublicUrl(primaryImageRecord.objectKey),
        altText: primaryImageRecord.altText,
      }
    : null;

  return {
    id: record.id,
    productId: record.productId,
    createdAt: record.createdAt,
    product: {
      id: product.id,
      name: product.name,
      slug: product.slug,
      price: formatMoney(product.basePrice),
      compareAtPrice: computeMinCompareAtPrice(product.variants),
      primaryImage,
      isAvailable: computeIsAvailable(product.status, product.variants),
      status: product.status,
    },
  };
}

// ---------------------------------------------------------------------------
// Public service operations
// ---------------------------------------------------------------------------

/**
 * Adds a product to the authenticated user's wishlist.
 *
 * Rules:
 * - Product must exist and be ACTIVE.
 * - If the user has already wishlisted this product the operation is idempotent
 *   (no duplicate row, no error).
 * - Database unique constraint on (user_id, product_id) guards concurrent requests.
 */
export async function addToWishlist(
  userId: string,
  input: AddToWishlistInput,
): Promise<AddToWishlistResult> {
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: { id: true, status: true },
  });

  if (!product) {
    throw new NotFoundError(`Product with ID "${input.productId}" not found`);
  }

  if (product.status !== ProductStatus.ACTIVE) {
    throw new AppError(422, 'This product is not available for wishlisting', {
      context: { productId: input.productId },
    });
  }

  // Check whether the item already exists before attempting creation.
  // The database unique constraint is still the authoritative guard against races.
  const existing = await wishlistRepository.findWishlistItemByUserAndProduct(
    userId,
    input.productId,
  );

  if (existing) {
    return {
      id: existing.id,
      productId: input.productId,
      createdAt: existing.createdAt,
      alreadyWishlisted: true,
    };
  }

  // Attempt to insert; null is returned on a concurrent unique constraint violation.
  const created = await wishlistRepository.createWishlistItem(userId, input.productId);

  if (!created) {
    // Concurrent insert won the race — fetch the existing row to return consistent data.
    const raced = await wishlistRepository.findWishlistItemByUserAndProduct(
      userId,
      input.productId,
    );

    if (!raced) {
      throw new AppError(500, 'Failed to retrieve wishlist item after concurrent insert');
    }

    return {
      id: raced.id,
      productId: input.productId,
      createdAt: raced.createdAt,
      alreadyWishlisted: true,
    };
  }

  return {
    id: created.id,
    productId: input.productId,
    createdAt: created.createdAt,
    alreadyWishlisted: false,
  };
}

/**
 * Removes a product from the authenticated user's wishlist.
 * Throws 404 when no matching item exists.
 * A user cannot remove another user's wishlist item.
 */
export async function removeFromWishlist(
  userId: string,
  productId: string,
): Promise<void> {
  const deleted = await wishlistRepository.deleteWishlistItem(userId, productId);

  if (!deleted) {
    throw new NotFoundError(`Wishlist item for product "${productId}" not found`);
  }
}

/**
 * Returns the authenticated user's wishlist.
 *
 * Visibility rule:
 * - WishlistItem records for INACTIVE products are excluded from the response
 *   but are NOT deleted from the database.
 * - Out-of-stock products remain in the response with isAvailable = false.
 *
 * Price freshness:
 * - Prices are always read from the current product/variant data; no price is
 *   stored on WishlistItem.
 */
export async function getWishlist(userId: string): Promise<WishlistResponse> {
  const records = await wishlistRepository.findUserWishlist(userId);

  // Filter out INACTIVE products for public visibility without touching the DB.
  const visibleRecords = records.filter(
    (r) => r.product.status === ProductStatus.ACTIVE,
  );

  return {
    items: visibleRecords.map(toWishlistItemResponse),
    count: visibleRecords.length,
  };
}

/**
 * Returns whether the authenticated user has wishlisted a specific product.
 * Allows the User Panel to efficiently check wishlist status on product pages.
 */
export async function checkWishlistStatus(
  userId: string,
  productId: string,
): Promise<{ isWishlisted: boolean }> {
  const isWishlisted = await wishlistRepository.wishlistItemExistsForUser(userId, productId);
  return { isWishlisted };
}
