import { Prisma, ProductStatus, ProductVariantStatus } from '@prisma/client';
import { AppError, NotFoundError } from '../../shared/errors/appError.js';
import { buildPublicUrl } from '../../shared/services/s3.js';
import * as cartRepository from './repository.js';
import type { CartItemRecord, CartRecord } from './repository.js';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export type AttributeSummary = {
  id: string;
  name: string;
  slug: string;
};

export type AttributeValueSummary = {
  id: string;
  attributeId: string;
  value: string;
  slug: string;
  colorCode: string | null;
  attribute: AttributeSummary;
};

export type CartItemAttributeResponse = {
  id: string;
  attributeValueId: string;
  attributeValue: AttributeValueSummary;
};

export type CartItemImageResponse = {
  id: string;
  imageUrl: string;
  altText: string | null;
  isPrimary: boolean;
} | null;

export type CartItemVariantResponse = {
  id: string;
  sku: string;
  price: string;
  compareAtPrice: string | null;
  status: ProductVariantStatus;
  product: {
    id: string;
    name: string;
    slug: string;
    status: ProductStatus;
  };
  attributes: CartItemAttributeResponse[];
  image: CartItemImageResponse;
  /** true when variant is active, product is active, and available stock > 0 */
  isAvailable: boolean;
  /** true when the cart quantity exceeds currently available stock */
  stockWarning: boolean;
};

export type CartItemResponse = {
  id: string;
  cartId: string;
  variantId: string;
  quantity: number;
  variant: CartItemVariantResponse;
  createdAt: Date;
  updatedAt: Date;
};

export type CartResponse = {
  id: string | null;
  items: CartItemResponse[];
  /** Number of unique line items */
  itemsCount: number;
  /** Sum of all item quantities */
  totalQuantity: number;
  /** Authoritative subtotal calculated from current variant prices */
  subtotal: string;
};

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export type AddToCartInput = {
  variantId: string;
  quantity: number;
};

export type UpdateCartItemInput = {
  quantity: number;
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatMoney(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function formatMoneyOrNull(value: Prisma.Decimal | null): string | null {
  return value === null ? null : formatMoney(value);
}

/**
 * Selects the best image for a cart item variant.
 *
 * Priority:
 * 1. Image associated with a color attribute value that the variant has
 * 2. Primary product image
 * 3. First product image
 */
function resolveVariantImage(item: CartItemRecord): CartItemImageResponse {
  const images = item.variant.product.images;

  if (images.length === 0) {
    return null;
  }

  const variantColorAttributeValueIds = new Set(
    item.variant.attributes
      .filter((a) => a.attributeValue.attribute.slug === 'color')
      .map((a) => a.attributeValueId),
  );

  const colorImage = images.find(
    (img) => img.attributeValueId && variantColorAttributeValueIds.has(img.attributeValueId),
  );

  if (colorImage) {
    return {
      id: colorImage.id,
      imageUrl: buildPublicUrl(colorImage.objectKey),
      altText: colorImage.altText,
      isPrimary: colorImage.isPrimary,
    };
  }

  const primaryImage = images.find((img) => img.isPrimary);
  const fallback = primaryImage ?? images[0];

  if (!fallback) {
    return null;
  }

  return {
    id: fallback.id,
    imageUrl: buildPublicUrl(fallback.objectKey),
    altText: fallback.altText,
    isPrimary: fallback.isPrimary,
  };
}

function toCartItemResponse(item: CartItemRecord): CartItemResponse {
  const variant = item.variant;
  const inventory = variant.inventory;
  const availableStock = inventory?.quantity ?? 0;

  const isVariantActive = variant.status === ProductVariantStatus.ACTIVE;
  const isProductActive = variant.product.status === ProductStatus.ACTIVE;
  const hasStock = availableStock > 0;
  const isAvailable = isVariantActive && isProductActive && hasStock;
  const stockWarning = item.quantity > availableStock;

  return {
    id: item.id,
    cartId: item.cartId,
    variantId: item.variantId,
    quantity: item.quantity,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    variant: {
      id: variant.id,
      sku: variant.sku,
      price: formatMoney(variant.price),
      compareAtPrice: formatMoneyOrNull(variant.compareAtPrice),
      status: variant.status,
      product: {
        id: variant.product.id,
        name: variant.product.name,
        slug: variant.product.slug,
        status: variant.product.status,
      },
      attributes: variant.attributes.map((attr) => ({
        id: attr.id,
        attributeValueId: attr.attributeValueId,
        attributeValue: {
          id: attr.attributeValue.id,
          attributeId: attr.attributeValue.attributeId,
          value: attr.attributeValue.value,
          slug: attr.attributeValue.slug,
          colorCode: attr.attributeValue.colorCode,
          attribute: {
            id: attr.attributeValue.attribute.id,
            name: attr.attributeValue.attribute.name,
            slug: attr.attributeValue.attribute.slug,
          },
        },
      })),
      image: resolveVariantImage(item),
      isAvailable,
      stockWarning,
    },
  };
}

function toCartResponse(cart: CartRecord | null): CartResponse {
  if (!cart) {
    return {
      id: null,
      items: [],
      itemsCount: 0,
      totalQuantity: 0,
      subtotal: '0.00',
    };
  }

  const items = cart.items.map(toCartItemResponse);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.items.reduce((acc, item) => {
    const lineTotal = item.variant.price.mul(item.quantity);
    return acc.add(lineTotal);
  }, new Prisma.Decimal(0));

  return {
    id: cart.id,
    items,
    itemsCount: items.length,
    totalQuantity,
    subtotal: subtotal.toFixed(2),
  };
}

// ---------------------------------------------------------------------------
// Domain validation helpers
// ---------------------------------------------------------------------------

function assertVariantActive(
  variantStatus: ProductVariantStatus,
  productStatus: ProductStatus,
  variantId: string,
): void {
  if (variantStatus !== ProductVariantStatus.ACTIVE) {
    throw new AppError(422, 'This product variant is no longer available', {
      context: { variantId },
    });
  }

  if (productStatus !== ProductStatus.ACTIVE) {
    throw new AppError(422, 'This product is no longer available', {
      context: { variantId },
    });
  }
}

function assertSufficientStock(
  variantId: string,
  inventory: { quantity: number } | null,
  requestedTotal: number,
): void {
  const available = inventory?.quantity ?? 0;

  if (requestedTotal > available) {
    throw new AppError(422, `Insufficient stock. Requested: ${requestedTotal}, available: ${available}`, {
      context: { variantId, requestedTotal, availableStock: available },
    });
  }
}

// ---------------------------------------------------------------------------
// Public service operations
// ---------------------------------------------------------------------------

/**
 * Returns the authenticated user's current cart.
 * Returns an empty-cart response when no cart has been created yet.
 */
export async function getCart(userId: string): Promise<CartResponse> {
  const cart = await cartRepository.findCartByUserId(userId);
  return toCartResponse(cart);
}

/**
 * Adds a variant to the user's cart.
 *
 * Behaviour when variant already in cart:
 *   new total = existing quantity + requested quantity
 *
 * Behaviour when variant not in cart:
 *   new cart item created with the requested quantity.
 *
 * Stock: Cart does NOT reserve inventory. The stock check here prevents
 * clearly invalid cart quantities. Final validation happens at checkout.
 *
 * Concurrency: An advisory row-level lock on the inventory record is acquired
 * inside the transaction so that two simultaneous requests for the same
 * variant serialise their stock checks.
 *
 * Price: No price is stored on CartItem. The authoritative price is always
 * read from ProductVariant at retrieval time.
 */
export async function addToCart(userId: string, input: AddToCartInput): Promise<CartResponse> {
  const cart = await cartRepository.runTransaction(async (tx) => {
    await cartRepository.lockInventoryRow(input.variantId, tx);

    const userCart = await cartRepository.findOrCreateCart(userId, tx);

    const existingItem = await cartRepository.findCartItemByVariantId(
      userCart.id,
      input.variantId,
      tx,
    );

    if (existingItem) {
      const requestedTotal = existingItem.quantity + input.quantity;

      assertVariantActive(
        existingItem.variant.status,
        existingItem.variant.product.status,
        input.variantId,
      );
      assertSufficientStock(input.variantId, existingItem.variant.inventory, requestedTotal);

      await cartRepository.updateCartItemQuantity(existingItem.id, requestedTotal, tx);
    } else {
      const variant = await tx.productVariant.findUnique({
        where: { id: input.variantId },
        select: {
          id: true,
          status: true,
          inventory: { select: { quantity: true } },
          product: { select: { status: true } },
        },
      });

      if (!variant) {
        throw new NotFoundError(`Product variant with ID "${input.variantId}" not found`);
      }

      assertVariantActive(variant.status, variant.product.status, input.variantId);
      assertSufficientStock(input.variantId, variant.inventory, input.quantity);

      await cartRepository.createCartItem(userCart.id, input.variantId, input.quantity, tx);
    }

    const refreshed = await cartRepository.findCartByUserId(userId, tx);

    if (!refreshed) {
      throw new AppError(500, 'Failed to load cart after update');
    }

    return refreshed;
  });

  return toCartResponse(cart);
}

/**
 * Updates the absolute quantity of a cart item (replaces the existing quantity).
 *
 * Ownership is verified: the cart item must belong to the authenticated user's cart.
 */
export async function updateCartItem(
  userId: string,
  cartItemId: string,
  input: UpdateCartItemInput,
): Promise<CartResponse> {
  const cart = await cartRepository.runTransaction(async (tx) => {
    const item = await cartRepository.findCartItemById(cartItemId, tx);

    if (!item) {
      throw new NotFoundError(`Cart item with ID "${cartItemId}" not found`);
    }

    const userCart = await cartRepository.findCartByUserId(userId, tx);

    if (!userCart || item.cartId !== userCart.id) {
      throw new AppError(403, 'You do not have permission to update this cart item');
    }

    await cartRepository.lockInventoryRow(item.variantId, tx);

    assertVariantActive(
      item.variant.status,
      item.variant.product.status,
      item.variantId,
    );
    assertSufficientStock(item.variantId, item.variant.inventory, input.quantity);

    await cartRepository.updateCartItemQuantity(cartItemId, input.quantity, tx);

    const refreshed = await cartRepository.findCartByUserId(userId, tx);

    if (!refreshed) {
      throw new AppError(500, 'Failed to load cart after update');
    }

    return refreshed;
  });

  return toCartResponse(cart);
}

/**
 * Removes a single item from the user's cart.
 * Ownership is verified before deletion.
 */
export async function removeCartItem(userId: string, cartItemId: string): Promise<CartResponse> {
  const item = await cartRepository.findCartItemById(cartItemId);

  if (!item) {
    throw new NotFoundError(`Cart item with ID "${cartItemId}" not found`);
  }

  const cart = await cartRepository.findCartByUserId(userId);

  if (!cart || item.cartId !== cart.id) {
    throw new AppError(403, 'You do not have permission to remove this cart item');
  }

  await cartRepository.deleteCartItem(cartItemId);

  const refreshed = await cartRepository.findCartByUserId(userId);
  return toCartResponse(refreshed);
}

/**
 * Removes all items from the user's cart.
 * Safe to call when the cart is already empty.
 */
export async function clearCart(userId: string): Promise<CartResponse> {
  const cart = await cartRepository.findCartByUserId(userId);

  if (!cart) {
    return toCartResponse(null);
  }

  await cartRepository.clearCartItems(cart.id);

  const refreshed = await cartRepository.findCartByUserId(userId);
  return toCartResponse(refreshed);
}
