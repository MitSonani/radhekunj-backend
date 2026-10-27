import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../shared/errors/appError.js';
import { isProduction } from '../../config/env.js';
import type {
  ShippingConfig,
  TaxConfig,
  CalculateFinancialsInput,
  FinancialCalculationResult,
  ShippingDetails,
  TaxBreakdown,
} from './types.js';

export const DEFAULT_SHIPPING_CONFIG: ShippingConfig = {
  enabled: true,
  flatRate: 0,
  freeShippingThreshold: 999,
};

export const DEFAULT_TAX_CONFIG: TaxConfig = {
  enabled: true,
  ratePercentage: 0,
  storeState: 'Gujarat',
  isInclusive: false,
};

export async function getShippingConfig(): Promise<ShippingConfig> {
  const setting = await prisma.storeSetting.findUnique({
    where: { key: 'shipping' },
  }).catch(() => null);

  if (setting && typeof setting.value === 'object' && setting.value !== null) {
    const val = setting.value as unknown as Partial<ShippingConfig>;
    if (typeof val.flatRate === 'number' && typeof val.freeShippingThreshold === 'number') {
      return {
        enabled: val.enabled ?? true,
        flatRate: val.flatRate,
        freeShippingThreshold: val.freeShippingThreshold,
      };
    }
  }

  // Fallback to environment variables
  const envFlatRate = process.env['SHIPPING_FEE'] ? parseFloat(process.env['SHIPPING_FEE']) : undefined;
  const envThreshold = process.env['FREE_SHIPPING_THRESHOLD'] ? parseFloat(process.env['FREE_SHIPPING_THRESHOLD']) : undefined;

  if (envFlatRate !== undefined && !isNaN(envFlatRate) && envThreshold !== undefined && !isNaN(envThreshold)) {
    return {
      enabled: true,
      flatRate: envFlatRate,
      freeShippingThreshold: envThreshold,
    };
  }

  if (isProduction) {
    throw new AppError(500, 'Financial configuration error: Store shipping policies are not configured.');
  }

  return DEFAULT_SHIPPING_CONFIG;
}

export async function getTaxConfig(): Promise<TaxConfig> {
  const setting = await prisma.storeSetting.findUnique({
    where: { key: 'tax' },
  }).catch(() => null);

  if (setting && typeof setting.value === 'object' && setting.value !== null) {
    const val = setting.value as unknown as Partial<TaxConfig>;
    if (typeof val.ratePercentage === 'number' && typeof val.storeState === 'string') {
      return {
        enabled: val.enabled ?? true,
        ratePercentage: val.ratePercentage,
        storeState: val.storeState,
        isInclusive: val.isInclusive ?? false,
      };
    }
  }

  // Fallback to environment variables
  const envRate = process.env['GST_RATE_PERCENTAGE'] ? parseFloat(process.env['GST_RATE_PERCENTAGE']) : undefined;
  const envState = process.env['STORE_STATE']?.trim();

  if (envRate !== undefined && !isNaN(envRate) && envState) {
    return {
      enabled: true,
      ratePercentage: envRate,
      storeState: envState,
      isInclusive: false,
    };
  }

  if (isProduction) {
    throw new AppError(500, 'Financial configuration error: Store GST policies are not configured.');
  }

  return DEFAULT_TAX_CONFIG;
}

export async function setShippingConfig(config: ShippingConfig): Promise<void> {
  await prisma.storeSetting.upsert({
    where: { key: 'shipping' },
    create: { key: 'shipping', value: config as unknown as Prisma.InputJsonValue },
    update: { value: config as unknown as Prisma.InputJsonValue },
  });
}

export async function setTaxConfig(config: TaxConfig): Promise<void> {
  await prisma.storeSetting.upsert({
    where: { key: 'tax' },
    create: { key: 'tax', value: config as unknown as Prisma.InputJsonValue },
    update: { value: config as unknown as Prisma.InputJsonValue },
  });
}

export async function calculateFinancials(
  input: CalculateFinancialsInput,
): Promise<FinancialCalculationResult> {
  const shippingConfig = input.shippingConfig ?? (await getShippingConfig());
  const taxConfig = input.taxConfig ?? (await getTaxConfig());

  if (!shippingConfig || !shippingConfig.enabled) {
    throw new AppError(500, 'Financial configuration error: Shipping is disabled or unconfigured.');
  }

  if (!taxConfig || !taxConfig.enabled) {
    throw new AppError(500, 'Financial configuration error: Tax calculation is disabled or unconfigured.');
  }

  const subtotal = input.subtotal;
  const discountAmount = input.discountAmount;
  const subtotalAfterDiscount = Prisma.Decimal.max(
    subtotal.sub(discountAmount),
    new Prisma.Decimal(0),
  );

  // 1. Shipping calculation
  const isFree = subtotalAfterDiscount.gte(shippingConfig.freeShippingThreshold);
  const shippingFee = isFree
    ? new Prisma.Decimal(0)
    : new Prisma.Decimal(shippingConfig.flatRate.toFixed(2));

  const shippingDetails: ShippingDetails = {
    rate: shippingConfig.flatRate.toFixed(2),
    threshold: shippingConfig.freeShippingThreshold.toFixed(2),
    isFree,
    feeApplied: shippingFee.toFixed(2),
  };

  // 2. Tax / GST calculation
  const customerState = (input.customerState || '').trim();
  const storeState = (taxConfig.storeState || '').trim();
  const isInterstate =
    customerState.toLowerCase() !== storeState.toLowerCase();

  let cgstRate = 0;
  let sgstRate = 0;
  let igstRate = 0;
  let cgstDecimal = new Prisma.Decimal(0);
  let sgstDecimal = new Prisma.Decimal(0);
  let igstDecimal = new Prisma.Decimal(0);

  if (isInterstate) {
    igstRate = taxConfig.ratePercentage;
    const rawIgst = subtotalAfterDiscount.mul(igstRate).div(100);
    igstDecimal = new Prisma.Decimal(rawIgst.toFixed(2));
  } else {
    cgstRate = taxConfig.ratePercentage / 2;
    sgstRate = taxConfig.ratePercentage / 2;
    const rawCgst = subtotalAfterDiscount.mul(cgstRate).div(100);
    const rawSgst = subtotalAfterDiscount.mul(sgstRate).div(100);
    cgstDecimal = new Prisma.Decimal(rawCgst.toFixed(2));
    sgstDecimal = new Prisma.Decimal(rawSgst.toFixed(2));
  }

  const taxAmount = cgstDecimal.add(sgstDecimal).add(igstDecimal);

  const taxBreakdown: TaxBreakdown = {
    taxRatePercentage: taxConfig.ratePercentage,
    isInterstate,
    cgstRate,
    cgstAmount: cgstDecimal.toFixed(2),
    sgstRate,
    sgstAmount: sgstDecimal.toFixed(2),
    igstRate,
    igstAmount: igstDecimal.toFixed(2),
    totalTax: taxAmount.toFixed(2),
    storeState,
    customerState,
  };

  // 3. Final total
  const totalAmount = subtotalAfterDiscount.add(shippingFee).add(taxAmount);

  return {
    subtotal,
    discountAmount,
    subtotalAfterDiscount,
    shippingFee,
    taxAmount,
    totalAmount,
    shippingDetails,
    taxBreakdown,
  };
}


export interface CodConfig {
  enabled: boolean;
  maxOrderValue?: number;
  allowedPostalCodes?: string[];
}

export const DEFAULT_COD_CONFIG: CodConfig = {
  enabled: true,
  maxOrderValue: 50000,
};

export async function getCodConfig(): Promise<CodConfig> {
  const setting = await prisma.storeSetting.findUnique({
    where: { key: 'cod' },
  }).catch(() => null);

  if (setting && typeof setting.value === 'object' && setting.value !== null) {
    const val = setting.value as unknown as Partial<CodConfig>;
    return {
      enabled: val.enabled ?? true,
      maxOrderValue: typeof val.maxOrderValue === 'number' ? val.maxOrderValue : undefined,
      allowedPostalCodes: Array.isArray(val.allowedPostalCodes) ? val.allowedPostalCodes : undefined,
    };
  }

  // Fallback to environment variables
  const envEnabled = process.env['COD_ENABLED'] !== undefined ? process.env['COD_ENABLED'] === 'true' : undefined;
  const envMaxValue = process.env['COD_MAX_ORDER_VALUE'] ? parseFloat(process.env['COD_MAX_ORDER_VALUE']) : undefined;

  if (envEnabled !== undefined || envMaxValue !== undefined) {
    return {
      enabled: envEnabled ?? true,
      maxOrderValue: envMaxValue,
    };
  }

  return DEFAULT_COD_CONFIG;
}

export async function setCodConfig(config: CodConfig): Promise<void> {
  await prisma.storeSetting.upsert({
    where: { key: 'cod' },
    create: { key: 'cod', value: config as unknown as Prisma.InputJsonValue },
    update: { value: config as unknown as Prisma.InputJsonValue },
  });
}

export async function checkCodEligibility(input: {
  totalAmount: Prisma.Decimal;
  postalCode?: string;
}): Promise<{ isEligible: boolean; reason?: string; maxOrderValue?: number }> {
  const config = await getCodConfig();

  if (!config.enabled) {
    return {
      isEligible: false,
      reason: 'Cash on Delivery is currently unavailable.',
    };
  }

  if (config.maxOrderValue !== undefined && input.totalAmount.gt(config.maxOrderValue)) {
    return {
      isEligible: false,
      reason: `Cash on Delivery is not available for orders above ₹${config.maxOrderValue.toLocaleString('en-IN')}. Please choose Online Payment.`,
      maxOrderValue: config.maxOrderValue,
    };
  }

  if (config.allowedPostalCodes && config.allowedPostalCodes.length > 0) {
    const postal = (input.postalCode || '').trim();
    if (!config.allowedPostalCodes.includes(postal)) {
      return {
        isEligible: false,
        reason: `Cash on Delivery is not serviceable for postal code ${postal}. Please choose Online Payment.`,
        maxOrderValue: config.maxOrderValue,
      };
    }
  }

  return { isEligible: true, maxOrderValue: config.maxOrderValue };
}
