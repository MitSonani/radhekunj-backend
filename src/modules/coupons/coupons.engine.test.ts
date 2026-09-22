import { describe, it, expect } from 'vitest';
import { CouponDiscountType, CouponScope, CouponStatus, Prisma } from '@prisma/client';
import {
  calculateDiscountAmount,
  determineEligibleItems,
  normalizeCode,
  roundMoney,
  type CartLineForCoupon,
} from './service.js';
import type { CouponRecord } from './repository.js';

function money(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function fakeCoupon(overrides: Partial<CouponRecord> = {}): CouponRecord {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    code: 'SAVE20',
    discountType: CouponDiscountType.PERCENTAGE,
    discountValue: money('20.00'),
    scope: CouponScope.CART,
    minimumCartValue: null,
    maximumDiscount: null,
    startsAt: new Date('2020-01-01T00:00:00.000Z'),
    expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    usageLimit: null,
    perUserLimit: null,
    status: CouponStatus.ACTIVE,
    createdAt: new Date('2020-01-01T00:00:00.000Z'),
    updatedAt: new Date('2020-01-01T00:00:00.000Z'),
    products: [],
    categories: [],
    ...overrides,
  };
}

function line(overrides: Partial<CartLineForCoupon> & { cartItemId: string }): CartLineForCoupon {
  return {
    productId: 'product-a',
    categoryId: 'category-a',
    quantity: 1,
    unitPrice: money('1000.00'),
    isAvailable: true,
    ...overrides,
  };
}

describe('Coupon engine — normalizeCode', () => {
  it('trims and uppercases mixed-case codes', () => {
    expect(normalizeCode('save20')).toBe('SAVE20');
    expect(normalizeCode('Save20')).toBe('SAVE20');
    expect(normalizeCode('  SAVE20  ')).toBe('SAVE20');
  });
});

describe('Coupon engine — calculateDiscountAmount', () => {
  it('applies a 10% percentage discount', () => {
    const discount = calculateDiscountAmount(
      CouponDiscountType.PERCENTAGE,
      money('10.00'),
      money('3000.00'),
      null,
    );
    expect(discount.toFixed(2)).toBe('300.00');
  });

  it('applies a 20% percentage discount', () => {
    const discount = calculateDiscountAmount(
      CouponDiscountType.PERCENTAGE,
      money('20.00'),
      money('3000.00'),
      null,
    );
    expect(discount.toFixed(2)).toBe('600.00');
  });

  it('caps percentage discount at maximumDiscount', () => {
    const discount = calculateDiscountAmount(
      CouponDiscountType.PERCENTAGE,
      money('20.00'),
      money('5000.00'),
      money('500.00'),
    );
    expect(discount.toFixed(2)).toBe('500.00');
  });

  it('does not exceed the eligible subtotal for a percentage discount', () => {
    const discount = calculateDiscountAmount(
      CouponDiscountType.PERCENTAGE,
      money('100.00'),
      money('250.00'),
      null,
    );
    expect(discount.toFixed(2)).toBe('250.00');
  });

  it('applies a fixed ₹500 discount', () => {
    const discount = calculateDiscountAmount(
      CouponDiscountType.FIXED_AMOUNT,
      money('500.00'),
      money('3000.00'),
      null,
    );
    expect(discount.toFixed(2)).toBe('500.00');
  });

  it('caps a fixed discount at the eligible subtotal', () => {
    const discount = calculateDiscountAmount(
      CouponDiscountType.FIXED_AMOUNT,
      money('500.00'),
      money('300.00'),
      null,
    );
    expect(discount.toFixed(2)).toBe('300.00');
  });

  it('allows a fixed discount equal to the eligible subtotal', () => {
    const discount = calculateDiscountAmount(
      CouponDiscountType.FIXED_AMOUNT,
      money('300.00'),
      money('300.00'),
      null,
    );
    expect(discount.toFixed(2)).toBe('300.00');
  });

  it('rounds percentage discounts to 2 decimal places (half-up)', () => {
    // 10% of 19.99 = 1.999 → 2.00
    const discount = calculateDiscountAmount(
      CouponDiscountType.PERCENTAGE,
      money('10.00'),
      money('19.99'),
      null,
    );
    expect(discount.toFixed(2)).toBe('2.00');
    expect(roundMoney(money('1.995')).toFixed(2)).toBe('2.00');
  });
});

describe('Coupon engine — determineEligibleItems', () => {
  const tshirt = line({ cartItemId: 'item-tshirt', productId: 'prod-tshirt', categoryId: 'cat-men' });
  const jeans = line({
    cartItemId: 'item-jeans',
    productId: 'prod-jeans',
    categoryId: 'cat-men',
    unitPrice: money('2000.00'),
  });
  const shoes = line({
    cartItemId: 'item-shoes',
    productId: 'prod-shoes',
    categoryId: 'cat-women',
    unitPrice: money('3000.00'),
  });
  const unavailable = line({
    cartItemId: 'item-oos',
    productId: 'prod-tshirt',
    categoryId: 'cat-men',
    isAvailable: false,
  });

  it('marks every available item eligible for a CART coupon', () => {
    const { eligible, ineligible } = determineEligibleItems(fakeCoupon({ scope: CouponScope.CART }), [
      tshirt,
      jeans,
      unavailable,
    ]);
    expect(eligible.map((i) => i.cartItemId)).toEqual(['item-tshirt', 'item-jeans']);
    expect(ineligible.map((i) => i.cartItemId)).toEqual(['item-oos']);
  });

  it('restricts PRODUCT coupons to mapped products across variants', () => {
    const coupon = fakeCoupon({
      scope: CouponScope.PRODUCT,
      products: [{ productId: 'prod-tshirt' }],
    });
    const black = line({ cartItemId: 'tshirt-black', productId: 'prod-tshirt', categoryId: 'cat-men' });
    const white = line({ cartItemId: 'tshirt-white', productId: 'prod-tshirt', categoryId: 'cat-men' });
    const { eligible, ineligible } = determineEligibleItems(coupon, [black, white, jeans]);
    expect(eligible.map((i) => i.cartItemId)).toEqual(['tshirt-black', 'tshirt-white']);
    expect(ineligible.map((i) => i.cartItemId)).toEqual(['item-jeans']);
  });

  it('restricts CATEGORY coupons to mapped categories', () => {
    const coupon = fakeCoupon({
      scope: CouponScope.CATEGORY,
      categories: [{ categoryId: 'cat-men' }],
    });
    const { eligible, ineligible } = determineEligibleItems(coupon, [tshirt, jeans, shoes]);
    expect(eligible.map((i) => i.cartItemId)).toEqual(['item-tshirt', 'item-jeans']);
    expect(ineligible.map((i) => i.cartItemId)).toEqual(['item-shoes']);
  });
});
