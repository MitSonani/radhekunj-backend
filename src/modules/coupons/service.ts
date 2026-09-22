import {
  CouponDiscountType,
  CouponScope,
  CouponStatus,
  Prisma,
  ProductStatus,
  ProductVariantStatus,
} from '@prisma/client';
import { AppError, NotFoundError } from '../../shared/errors/appError.js';
import { prisma } from '../../database/prisma.js';
import * as couponRepository from './repository.js';
import type { CouponRecord } from './repository.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal cart line used by the coupon engine.
 * Prices must already be the authoritative variant prices.
 */
export type CartLineForCoupon = {
  cartItemId: string;
  productId: string;
  categoryId: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  /**
   * true when the variant is ACTIVE, the product is ACTIVE, and available
   * stock > 0. Unavailable lines never contribute to the discount.
   */
  isAvailable: boolean;
};

export type CouponEvaluation = {
  couponId: string;
  couponCode: string;
  discountType: CouponDiscountType;
  discountValue: Prisma.Decimal;
  scope: CouponScope;
  /** Full cart subtotal used for minimum-order qualification. */
  cartSubtotal: Prisma.Decimal;
  /** Subtotal of eligible, available line items only. */
  eligibleSubtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  /** cartSubtotal - discountAmount. Never negative. */
  finalSubtotal: Prisma.Decimal;
  eligibleItemIds: string[];
  ineligibleItemIds: string[];
};

export type ValidateCouponInput = {
  code: string;
  userId: string;
  items: CartLineForCoupon[];
  now?: Date;
};

export type ConsumeCouponUsageInput = {
  couponId: string;
  userId: string;
  /** Null until the Order module exists. Do not invent placeholder order IDs. */
  orderId: string | null;
  discountAmount: Prisma.Decimal;
};

type UsageCounts = {
  totalCount: number;
  userCount: number;
};

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * Rounds to 2 decimal places using half-up, matching Decimal(12, 2) storage.
 */
export function roundMoney(value: Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

export function sumLineTotals(items: CartLineForCoupon[]): Prisma.Decimal {
  return items.reduce((acc, item) => acc.add(item.unitPrice.mul(item.quantity)), new Prisma.Decimal(0));
}

// ---------------------------------------------------------------------------
// Code normalization
// ---------------------------------------------------------------------------

/**
 * Trims whitespace and uppercases the coupon code.
 * `save20`, `Save20`, and `SAVE20` all become `SAVE20`.
 */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

function isItemInScope(coupon: CouponRecord, item: CartLineForCoupon): boolean {
  switch (coupon.scope) {
    case CouponScope.CART:
      return true;
    case CouponScope.PRODUCT:
      return coupon.products.some((mapping) => mapping.productId === item.productId);
    case CouponScope.CATEGORY:
      return coupon.categories.some((mapping) => mapping.categoryId === item.categoryId);
    default: {
      const exhaustive: never = coupon.scope;
      throw new AppError(500, `Unsupported coupon scope: ${String(exhaustive)}`);
    }
  }
}

/**
 * Splits cart lines into eligible and ineligible sets.
 *
 * A line is eligible only when:
 *   1. it is currently available (active product + active variant + stock > 0)
 *   2. it matches the coupon scope (CART / PRODUCT / CATEGORY)
 *
 * PRODUCT scope matches the product, not a specific SKU/variant.
 * CATEGORY scope uses the product's single categoryId.
 *
 * Unavailable items never contribute to the discount, even for CART coupons.
 * Items with a stock warning (qty > stock but stock > 0) still count at the
 * cart quantity — matching existing cart subtotal behaviour.
 */
export function determineEligibleItems(
  coupon: CouponRecord,
  items: CartLineForCoupon[],
): { eligible: CartLineForCoupon[]; ineligible: CartLineForCoupon[] } {
  const eligible: CartLineForCoupon[] = [];
  const ineligible: CartLineForCoupon[] = [];

  for (const item of items) {
    if (item.isAvailable && isItemInScope(coupon, item)) {
      eligible.push(item);
    } else {
      ineligible.push(item);
    }
  }

  return { eligible, ineligible };
}

// ---------------------------------------------------------------------------
// Discount calculation — single source of truth
// ---------------------------------------------------------------------------

/**
 * Calculates the discount amount for an eligible subtotal.
 *
 * Order of operations:
 *   1. Raw discount (percentage of eligible subtotal, or fixed amount)
 *   2. Apply maximumDiscount cap when configured
 *   3. Cap at eligibleSubtotal so the discount can never exceed it
 *
 * Does not apply tax, shipping, or fees.
 */
export function calculateDiscountAmount(
  discountType: CouponDiscountType,
  discountValue: Prisma.Decimal,
  eligibleSubtotal: Prisma.Decimal,
  maximumDiscount: Prisma.Decimal | null,
): Prisma.Decimal {
  let discount: Prisma.Decimal;

  if (discountType === CouponDiscountType.PERCENTAGE) {
    discount = roundMoney(eligibleSubtotal.mul(discountValue).div(100));
  } else {
    discount = roundMoney(discountValue);
  }

  if (maximumDiscount !== null && discount.greaterThan(maximumDiscount)) {
    discount = roundMoney(maximumDiscount);
  }

  if (discount.greaterThan(eligibleSubtotal)) {
    discount = eligibleSubtotal;
  }

  if (discount.isNegative()) {
    discount = new Prisma.Decimal(0);
  }

  return roundMoney(discount);
}

// ---------------------------------------------------------------------------
// Rule checks
// ---------------------------------------------------------------------------

export function assertCouponCurrentlyValid(coupon: CouponRecord, now: Date): void {
  if (coupon.status !== CouponStatus.ACTIVE) {
    throw new AppError(422, 'This coupon is no longer active', {
      context: { couponId: coupon.id, status: coupon.status },
    });
  }

  if (now < coupon.startsAt) {
    throw new AppError(422, 'This coupon is not yet valid', {
      context: { couponId: coupon.id, startsAt: coupon.startsAt.toISOString() },
    });
  }

  if (now > coupon.expiresAt) {
    throw new AppError(422, 'This coupon has expired', {
      context: { couponId: coupon.id, expiresAt: coupon.expiresAt.toISOString() },
    });
  }
}

export function assertUsageLimits(coupon: CouponRecord, usage: UsageCounts): void {
  if (coupon.usageLimit !== null && usage.totalCount >= coupon.usageLimit) {
    throw new AppError(422, 'This coupon has reached its usage limit', {
      context: { couponId: coupon.id, usageLimit: coupon.usageLimit, totalCount: usage.totalCount },
    });
  }

  if (coupon.perUserLimit !== null && usage.userCount >= coupon.perUserLimit) {
    throw new AppError(422, 'You have already used this coupon the maximum number of times', {
      context: {
        couponId: coupon.id,
        perUserLimit: coupon.perUserLimit,
        userCount: usage.userCount,
      },
    });
  }
}

export function assertMinimumCartValue(coupon: CouponRecord, cartSubtotal: Prisma.Decimal): void {
  if (coupon.minimumCartValue === null) {
    return;
  }

  if (cartSubtotal.lessThan(coupon.minimumCartValue)) {
    throw new AppError(422, 'Cart total does not meet the minimum order value for this coupon', {
      context: {
        couponId: coupon.id,
        minimumCartValue: coupon.minimumCartValue.toFixed(2),
        cartSubtotal: cartSubtotal.toFixed(2),
      },
    });
  }
}

export function assertCartHasItems(items: CartLineForCoupon[]): void {
  if (items.length === 0) {
    throw new AppError(422, 'Cannot apply a coupon to an empty cart');
  }
}

/**
 * Builds the full evaluation for an already-loaded coupon.
 * Throws AppError when the coupon cannot be applied to these items.
 */
export function evaluateLoadedCoupon(
  coupon: CouponRecord,
  items: CartLineForCoupon[],
  usage: UsageCounts,
  now: Date = new Date(),
): CouponEvaluation {
  assertCartHasItems(items);
  assertCouponCurrentlyValid(coupon, now);
  assertUsageLimits(coupon, usage);

  const cartSubtotal = sumLineTotals(items);
  assertMinimumCartValue(coupon, cartSubtotal);

  const { eligible, ineligible } = determineEligibleItems(coupon, items);
  const eligibleSubtotal = sumLineTotals(eligible);

  if (eligible.length === 0 || eligibleSubtotal.lessThanOrEqualTo(0)) {
    throw new AppError(422, 'This coupon does not apply to any items in your cart', {
      context: { couponId: coupon.id, scope: coupon.scope },
    });
  }

  const discountAmount = calculateDiscountAmount(
    coupon.discountType,
    coupon.discountValue,
    eligibleSubtotal,
    coupon.maximumDiscount,
  );

  if (discountAmount.lessThanOrEqualTo(0)) {
    throw new AppError(422, 'This coupon does not apply to any items in your cart', {
      context: { couponId: coupon.id, eligibleSubtotal: eligibleSubtotal.toFixed(2) },
    });
  }

  const finalSubtotal = roundMoney(cartSubtotal.sub(discountAmount));

  return {
    couponId: coupon.id,
    couponCode: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    scope: coupon.scope,
    cartSubtotal,
    eligibleSubtotal,
    discountAmount,
    finalSubtotal: finalSubtotal.isNegative() ? new Prisma.Decimal(0) : finalSubtotal,
    eligibleItemIds: eligible.map((item) => item.cartItemId),
    ineligibleItemIds: ineligible.map((item) => item.cartItemId),
  };
}

// ---------------------------------------------------------------------------
// Public service operations
// ---------------------------------------------------------------------------

/**
 * Validates a coupon against the given cart lines and returns the calculated
 * discount. Does NOT persist anything and does NOT increment usage.
 *
 * This is the single coupon-calculation entry point. Cart apply, cart reads,
 * and future checkout/order flows must call this (or evaluateLoadedCoupon)
 * rather than reimplementing discount math.
 */
export async function validateCouponForCart(input: ValidateCouponInput): Promise<CouponEvaluation> {
  const code = normalizeCode(input.code);

  if (!code) {
    throw new AppError(422, 'Invalid coupon code');
  }

  const coupon = await couponRepository.findCouponByCode(code);

  if (!coupon) {
    throw new NotFoundError('Coupon not found');
  }

  const [totalCount, userCount] = await Promise.all([
    couponRepository.countCouponUsages(coupon.id),
    couponRepository.countUserCouponUsages(coupon.id, input.userId),
  ]);

  return evaluateLoadedCoupon(coupon, input.items, { totalCount, userCount }, input.now ?? new Date());
}

/**
 * Re-evaluates a coupon already stored on a cart, using current prices,
 * current catalog eligibility, and current usage counts.
 *
 * Returns null when the coupon is missing or no longer valid so the caller
 * can clear stored cart state. Unexpected errors are rethrown.
 */
export async function revalidateStoredCoupon(
  couponId: string,
  userId: string,
  items: CartLineForCoupon[],
  now: Date = new Date(),
): Promise<CouponEvaluation | null> {
  const coupon = await couponRepository.findCouponById(couponId);

  if (!coupon) {
    return null;
  }

  try {
    const [totalCount, userCount] = await Promise.all([
      couponRepository.countCouponUsages(coupon.id),
      couponRepository.countUserCouponUsages(coupon.id, userId),
    ]);

    return evaluateLoadedCoupon(coupon, items, { totalCount, userCount }, now);
  } catch (error) {
    if (error instanceof AppError && error.statusCode < 500) {
      return null;
    }

    throw error;
  }
}

/**
 * Records a successful coupon redemption.
 *
 * MUST be called inside the Order-creation transaction. Locks the coupon row
 * (`SELECT … FOR UPDATE`), re-checks total and per-user limits, then inserts
 * CouponUsage. Cart apply/validate must never call this.
 *
 * Concurrent order attempts for the last remaining use serialise on the
 * coupon row lock; the loser sees the updated count and is rejected.
 */
export async function consumeCouponUsage(
  tx: Prisma.TransactionClient,
  input: ConsumeCouponUsageInput,
): Promise<void> {
  await couponRepository.lockCouponRow(input.couponId, tx);

  const coupon = await couponRepository.findCouponById(input.couponId, tx);

  if (!coupon) {
    throw new NotFoundError('Coupon not found');
  }

  assertCouponCurrentlyValid(coupon, new Date());

  const [totalCount, userCount] = await Promise.all([
    couponRepository.countCouponUsages(input.couponId, tx),
    couponRepository.countUserCouponUsages(input.couponId, input.userId, tx),
  ]);

  assertUsageLimits(coupon, { totalCount, userCount });

  await couponRepository.createCouponUsage(
    {
      couponId: input.couponId,
      userId: input.userId,
      orderId: input.orderId,
      discountAmount: input.discountAmount,
    },
    tx,
  );
}

/**
 * Helper for cart (and future checkout) to map a loaded cart item into the
 * coupon engine's line shape without a second product query.
 */
export function toCartLineForCoupon(item: {
  id: string;
  quantity: number;
  variant: {
    price: Prisma.Decimal;
    status: ProductVariantStatus;
    inventory: { quantity: number } | null;
    product: {
      id: string;
      categoryId: string;
      status: ProductStatus;
    };
  };
}): CartLineForCoupon {
  const availableStock = item.variant.inventory?.quantity ?? 0;
  const isAvailable =
    item.variant.status === ProductVariantStatus.ACTIVE &&
    item.variant.product.status === ProductStatus.ACTIVE &&
    availableStock > 0;

  return {
    cartItemId: item.id,
    productId: item.variant.product.id,
    categoryId: item.variant.product.categoryId,
    quantity: item.quantity,
    unitPrice: item.variant.price,
    isAvailable,
  };
}

export async function runTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(fn);
}
