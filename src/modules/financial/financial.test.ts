import { describe, it, expect, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import {
  calculateFinancials,
  getShippingConfig,
  getTaxConfig,
  setShippingConfig,
  setTaxConfig,
} from './service.js';

describe('Financial Calculation Service', () => {
  beforeEach(async () => {
    await prisma.storeSetting.deleteMany();
  });

  it('1. Calculates shipping fee when subtotal is below free-shipping threshold', async () => {
    const result = await calculateFinancials({
      subtotal: new Prisma.Decimal(500),
      discountAmount: new Prisma.Decimal(0),
      customerState: 'Gujarat',
      shippingConfig: { enabled: true, flatRate: 100, freeShippingThreshold: 999 },
      taxConfig: { enabled: true, ratePercentage: 12, storeState: 'Gujarat', isInclusive: false },
    });

    expect(result.shippingFee.toString()).toBe('100');
    expect(result.shippingDetails.isFree).toBe(false);
    expect(result.shippingDetails.feeApplied).toBe('100.00');
  });

  it('2. Grants free shipping when subtotal is at or above free-shipping threshold', async () => {
    const result = await calculateFinancials({
      subtotal: new Prisma.Decimal(1200),
      discountAmount: new Prisma.Decimal(0),
      customerState: 'Gujarat',
      shippingConfig: { enabled: true, flatRate: 100, freeShippingThreshold: 999 },
      taxConfig: { enabled: true, ratePercentage: 12, storeState: 'Gujarat', isInclusive: false },
    });

    expect(result.shippingFee.toString()).toBe('0');
    expect(result.shippingDetails.isFree).toBe(true);
    expect(result.shippingDetails.feeApplied).toBe('0.00');
  });

  it('3. Discounts reduce subtotal before checking free shipping threshold', async () => {
    // 1000 subtotal - 200 coupon = 800 (below 999 threshold -> charges shipping)
    const result = await calculateFinancials({
      subtotal: new Prisma.Decimal(1000),
      discountAmount: new Prisma.Decimal(200),
      customerState: 'Gujarat',
      shippingConfig: { enabled: true, flatRate: 100, freeShippingThreshold: 999 },
      taxConfig: { enabled: true, ratePercentage: 12, storeState: 'Gujarat', isInclusive: false },
    });

    expect(result.subtotalAfterDiscount.toString()).toBe('800');
    expect(result.shippingFee.toString()).toBe('100');
    expect(result.shippingDetails.isFree).toBe(false);
  });

  it('4. Calculates intra-state GST (CGST + SGST) accurately with rounding', async () => {
    // subtotal 1000, 12% GST intra-state in Gujarat -> 6% CGST (60), 6% SGST (60), 0 IGST
    const result = await calculateFinancials({
      subtotal: new Prisma.Decimal(1000),
      discountAmount: new Prisma.Decimal(0),
      customerState: 'Gujarat',
      shippingConfig: { enabled: true, flatRate: 100, freeShippingThreshold: 999 },
      taxConfig: { enabled: true, ratePercentage: 12, storeState: 'Gujarat', isInclusive: false },
    });

    expect(result.taxBreakdown.isInterstate).toBe(false);
    expect(result.taxBreakdown.cgstRate).toBe(6);
    expect(result.taxBreakdown.cgstAmount).toBe('60.00');
    expect(result.taxBreakdown.sgstRate).toBe(6);
    expect(result.taxBreakdown.sgstAmount).toBe('60.00');
    expect(result.taxBreakdown.igstRate).toBe(0);
    expect(result.taxBreakdown.igstAmount).toBe('0.00');
    expect(result.taxAmount.toString()).toBe('120');
    // Total = 1000 + 0 (free shipping) + 120 (tax) = 1120
    expect(result.totalAmount.toString()).toBe('1120');
  });

  it('5. Calculates inter-state GST (IGST only) accurately for interstate customers', async () => {
    // Customer in Maharashtra, Store in Gujarat -> 12% IGST (120), 0 CGST, 0 SGST
    const result = await calculateFinancials({
      subtotal: new Prisma.Decimal(1000),
      discountAmount: new Prisma.Decimal(0),
      customerState: 'Maharashtra',
      shippingConfig: { enabled: true, flatRate: 100, freeShippingThreshold: 999 },
      taxConfig: { enabled: true, ratePercentage: 12, storeState: 'Gujarat', isInclusive: false },
    });

    expect(result.taxBreakdown.isInterstate).toBe(true);
    expect(result.taxBreakdown.igstRate).toBe(12);
    expect(result.taxBreakdown.igstAmount).toBe('120.00');
    expect(result.taxBreakdown.cgstRate).toBe(0);
    expect(result.taxBreakdown.cgstAmount).toBe('0.00');
    expect(result.taxBreakdown.sgstRate).toBe(0);
    expect(result.taxBreakdown.sgstAmount).toBe('0.00');
    expect(result.taxAmount.toString()).toBe('120');
    expect(result.totalAmount.toString()).toBe('1120');
  });

  it('6. Loads and updates configuration from StoreSetting in database', async () => {
    await setShippingConfig({ enabled: true, flatRate: 150, freeShippingThreshold: 1500 });
    await setTaxConfig({ enabled: true, ratePercentage: 18, storeState: 'Karnataka', isInclusive: false });

    const shipping = await getShippingConfig();
    expect(shipping.flatRate).toBe(150);
    expect(shipping.freeShippingThreshold).toBe(1500);

    const tax = await getTaxConfig();
    expect(tax.ratePercentage).toBe(18);
    expect(tax.storeState).toBe('Karnataka');

    // Test calculation using DB-persisted config
    const result = await calculateFinancials({
      subtotal: new Prisma.Decimal(1000),
      discountAmount: new Prisma.Decimal(0),
      customerState: 'Karnataka',
    });

    expect(result.shippingFee.toString()).toBe('150'); // 1000 < 1500
    expect(result.taxBreakdown.isInterstate).toBe(false);
    expect(result.taxBreakdown.cgstAmount).toBe('90.00'); // 9% of 1000
    expect(result.taxBreakdown.sgstAmount).toBe('90.00');
    expect(result.taxAmount.toString()).toBe('180');
    expect(result.totalAmount.toString()).toBe('1330'); // 1000 + 150 + 180
  });
});
