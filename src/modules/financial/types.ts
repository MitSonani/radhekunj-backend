import { Prisma } from '@prisma/client';

export interface ShippingConfig {
  enabled: boolean;
  flatRate: number;
  freeShippingThreshold: number;
}

export interface TaxConfig {
  enabled: boolean;
  ratePercentage: number;
  storeState: string;
  isInclusive: boolean;
}

export interface TaxBreakdown {
  taxRatePercentage: number;
  isInterstate: boolean;
  cgstRate: number;
  cgstAmount: string;
  sgstRate: number;
  sgstAmount: string;
  igstRate: number;
  igstAmount: string;
  totalTax: string;
  storeState: string;
  customerState: string;
}

export interface ShippingDetails {
  rate: string;
  threshold: string;
  isFree: boolean;
  feeApplied: string;
}

export interface CalculateFinancialsInput {
  subtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  customerState: string;
  shippingConfig?: ShippingConfig;
  taxConfig?: TaxConfig;
}

export interface FinancialCalculationResult {
  subtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  subtotalAfterDiscount: Prisma.Decimal;
  shippingFee: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  shippingDetails: ShippingDetails;
  taxBreakdown: TaxBreakdown;
}
