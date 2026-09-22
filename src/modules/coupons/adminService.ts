import {
  CouponDiscountType,
  CouponScope,
  CouponStatus,
  Prisma,
} from '@prisma/client';
import { AppError, NotFoundError } from '../../shared/errors/appError.js';
import { buildPaginationMeta } from '../../shared/utils/pagination.js';
import type { PaginationMeta } from '../../shared/types/index.js';
import { normalizeCode } from './service.js';
import * as couponRepository from './repository.js';
import type {
  AdminCouponDetailRecord,
  AdminCouponListRecord,
  CouponUsageRecord,
} from './repository.js';

export type CouponValidity = 'CURRENT' | 'UPCOMING' | 'EXPIRED';

export type CatalogTargetSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

export type AdminCouponResponse = {
  id: string;
  code: string;
  discountType: CouponDiscountType;
  discountValue: string;
  scope: CouponScope;
  minimumCartValue: string | null;
  maximumDiscount: string | null;
  startsAt: Date;
  expiresAt: Date;
  usageLimit: number | null;
  usageCount: number;
  perUserLimit: number | null;
  status: CouponStatus;
  validity: CouponValidity;
  createdAt: Date;
  updatedAt: Date;
  products: CatalogTargetSummary[];
  categories: CatalogTargetSummary[];
};

export type AdminCouponListItem = Omit<AdminCouponResponse, 'products' | 'categories'>;

export type CreateCouponInput = {
  code: string;
  discountType: CouponDiscountType;
  discountValue: string;
  scope: CouponScope;
  minimumCartValue?: string | null;
  maximumDiscount?: string | null;
  startsAt: Date;
  expiresAt: Date;
  usageLimit?: number | null;
  perUserLimit?: number | null;
  status?: CouponStatus;
  productIds?: string[];
  categoryIds?: string[];
};

export type UpdateCouponInput = {
  code?: string;
  discountType?: CouponDiscountType;
  discountValue?: string;
  scope?: CouponScope;
  minimumCartValue?: string | null;
  maximumDiscount?: string | null;
  startsAt?: Date;
  expiresAt?: Date;
  usageLimit?: number | null;
  perUserLimit?: number | null;
  status?: CouponStatus;
  productIds?: string[];
  categoryIds?: string[];
};

export type ListCouponsInput = {
  page: number;
  limit: number;
  search?: string;
  status?: CouponStatus;
  discountType?: CouponDiscountType;
  scope?: CouponScope;
  validity?: CouponValidity;
};

function formatMoney(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function formatMoneyOrNull(value: Prisma.Decimal | null): string | null {
  return value === null ? null : formatMoney(value);
}

export function deriveValidity(startsAt: Date, expiresAt: Date, now: Date = new Date()): CouponValidity {
  if (now < startsAt) {
    return 'UPCOMING';
  }

  if (now > expiresAt) {
    return 'EXPIRED';
  }

  return 'CURRENT';
}

function toListItem(coupon: AdminCouponListRecord, now: Date): AdminCouponListItem {
  return {
    id: coupon.id,
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: formatMoney(coupon.discountValue),
    scope: coupon.scope,
    minimumCartValue: formatMoneyOrNull(coupon.minimumCartValue),
    maximumDiscount: formatMoneyOrNull(coupon.maximumDiscount),
    startsAt: coupon.startsAt,
    expiresAt: coupon.expiresAt,
    usageLimit: coupon.usageLimit,
    usageCount: coupon._count.usages,
    perUserLimit: coupon.perUserLimit,
    status: coupon.status,
    validity: deriveValidity(coupon.startsAt, coupon.expiresAt, now),
    createdAt: coupon.createdAt,
    updatedAt: coupon.updatedAt,
  };
}

function toDetail(coupon: AdminCouponDetailRecord, now: Date): AdminCouponResponse {
  return {
    ...toListItem(coupon, now),
    products: coupon.products.map((mapping) => ({
      id: mapping.product.id,
      name: mapping.product.name,
      slug: mapping.product.slug,
      status: mapping.product.status,
    })),
    categories: coupon.categories.map((mapping) => ({
      id: mapping.category.id,
      name: mapping.category.name,
      slug: mapping.category.slug,
      status: mapping.category.status,
    })),
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function assertDiscountCompatible(discountType: CouponDiscountType, discountValue: string): void {
  const amount = Number(discountValue);

  if (!(amount > 0)) {
    throw new AppError(422, 'discountValue must be greater than 0');
  }

  if (discountType === CouponDiscountType.PERCENTAGE && amount > 100) {
    throw new AppError(422, 'Percentage discountValue cannot exceed 100');
  }
}

async function assertProductsExist(productIds: string[]): Promise<void> {
  const found = await couponRepository.findProductIds(productIds);
  if (found.length === productIds.length) {
    return;
  }

  const foundSet = new Set(found);
  const missingIds = productIds.filter((id) => !foundSet.has(id));
  throw new AppError(422, 'One or more product IDs are invalid', { context: { missingIds } });
}

async function assertCategoriesExist(categoryIds: string[]): Promise<void> {
  const found = await couponRepository.findCategoryIds(categoryIds);
  if (found.length === categoryIds.length) {
    return;
  }

  const foundSet = new Set(found);
  const missingIds = categoryIds.filter((id) => !foundSet.has(id));
  throw new AppError(422, 'One or more category IDs are invalid', { context: { missingIds } });
}

async function assertCodeAvailable(code: string, excludeId?: string): Promise<void> {
  const existing = await couponRepository.findCouponByCode(code);
  if (existing && existing.id !== excludeId) {
    throw new AppError(409, `Coupon code "${code}" already exists`);
  }
}

function assertStructurallyValid(coupon: {
  scope: CouponScope;
  products: { productId: string }[];
  categories: { categoryId: string }[];
}): void {
  if (coupon.scope === CouponScope.PRODUCT && coupon.products.length === 0) {
    throw new AppError(422, 'A PRODUCT coupon must have at least one eligible product');
  }

  if (coupon.scope === CouponScope.CATEGORY && coupon.categories.length === 0) {
    throw new AppError(422, 'A CATEGORY coupon must have at least one eligible category');
  }

  if (coupon.scope === CouponScope.CART && (coupon.products.length > 0 || coupon.categories.length > 0)) {
    throw new AppError(422, 'A CART coupon cannot have product or category mappings');
  }
}

function assertImmutableFieldsUnchanged(
  existing: AdminCouponDetailRecord,
  input: UpdateCouponInput,
  usageCount: number,
): void {
  if (usageCount === 0) {
    return;
  }

  const attempted: string[] = [];

  if (input.code !== undefined && input.code !== existing.code) {
    attempted.push('code');
  }
  if (input.discountType !== undefined && input.discountType !== existing.discountType) {
    attempted.push('discountType');
  }
  if (
    input.discountValue !== undefined &&
    !existing.discountValue.equals(new Prisma.Decimal(input.discountValue))
  ) {
    attempted.push('discountValue');
  }
  if (input.scope !== undefined && input.scope !== existing.scope) {
    attempted.push('scope');
  }

  if (attempted.length > 0) {
    throw new AppError(
      422,
      'This coupon has already been used and cannot change code, discount type, discount value, or scope',
      { context: { fields: attempted } },
    );
  }
}

function resolveNextMappings(
  existing: AdminCouponDetailRecord,
  nextScope: CouponScope,
  input: UpdateCouponInput,
): { productIds: string[]; categoryIds: string[]; mappingsChanged: boolean } {
  const existingProductIds = existing.products.map((mapping) => mapping.productId);
  const existingCategoryIds = existing.categories.map((mapping) => mapping.categoryId);

  if (nextScope === CouponScope.CART) {
    if (input.productIds !== undefined || input.categoryIds !== undefined) {
      throw new AppError(422, 'CART coupons cannot include productIds or categoryIds');
    }

    return {
      productIds: [],
      categoryIds: [],
      mappingsChanged: existingProductIds.length > 0 || existingCategoryIds.length > 0,
    };
  }

  if (nextScope === CouponScope.PRODUCT) {
    if (input.categoryIds !== undefined) {
      throw new AppError(422, 'PRODUCT coupons cannot include categoryIds');
    }

    const productIds = input.productIds ?? existingProductIds;
    if (productIds.length === 0) {
      throw new AppError(422, 'A PRODUCT coupon must have at least one eligible product');
    }

    return {
      productIds,
      categoryIds: [],
      mappingsChanged:
        input.productIds !== undefined ||
        existingCategoryIds.length > 0 ||
        existing.scope !== CouponScope.PRODUCT,
    };
  }

  if (input.productIds !== undefined) {
    throw new AppError(422, 'CATEGORY coupons cannot include productIds');
  }

  const categoryIds = input.categoryIds ?? existingCategoryIds;
  if (categoryIds.length === 0) {
    throw new AppError(422, 'A CATEGORY coupon must have at least one eligible category');
  }

  return {
    productIds: [],
    categoryIds,
    mappingsChanged:
      input.categoryIds !== undefined ||
      existingProductIds.length > 0 ||
      existing.scope !== CouponScope.CATEGORY,
  };
}

async function requireCoupon(couponId: string): Promise<AdminCouponDetailRecord> {
  const coupon = await couponRepository.findCouponDetailById(couponId);
  if (!coupon) {
    throw new NotFoundError(`Coupon with ID "${couponId}" not found`);
  }
  return coupon;
}

/**
 * Creates a coupon and its scope mappings in a single transaction.
 */
export async function createCoupon(input: CreateCouponInput): Promise<AdminCouponResponse> {
  const code = normalizeCode(input.code);
  assertDiscountCompatible(input.discountType, input.discountValue);
  await assertCodeAvailable(code);

  const productIds = input.scope === CouponScope.PRODUCT ? (input.productIds ?? []) : [];
  const categoryIds = input.scope === CouponScope.CATEGORY ? (input.categoryIds ?? []) : [];

  if (input.scope === CouponScope.PRODUCT) {
    if (productIds.length === 0) {
      throw new AppError(422, 'A PRODUCT coupon must have at least one eligible product');
    }
    await assertProductsExist(productIds);
  }

  if (input.scope === CouponScope.CATEGORY) {
    if (categoryIds.length === 0) {
      throw new AppError(422, 'A CATEGORY coupon must have at least one eligible category');
    }
    await assertCategoriesExist(categoryIds);
  }

  if (input.scope === CouponScope.CART && (input.productIds || input.categoryIds)) {
    throw new AppError(422, 'CART coupons cannot include productIds or categoryIds');
  }

  try {
    const created = await couponRepository.runTransaction((tx) =>
      couponRepository.createCouponWithMappings(
        {
          code,
          discountType: input.discountType,
          discountValue: input.discountValue,
          scope: input.scope,
          minimumCartValue: input.minimumCartValue ?? null,
          maximumDiscount: input.maximumDiscount ?? null,
          startsAt: input.startsAt,
          expiresAt: input.expiresAt,
          usageLimit: input.usageLimit ?? null,
          perUserLimit: input.perUserLimit ?? null,
          status: input.status,
          productIds,
          categoryIds,
        },
        tx,
      ),
    );

    return toDetail(created, new Date());
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(409, `Coupon code "${code}" already exists`);
    }
    throw error;
  }
}

export async function listCoupons(
  input: ListCouponsInput,
): Promise<{ coupons: AdminCouponListItem[]; pagination: PaginationMeta }> {
  const now = new Date();
  const filters = {
    search: input.search,
    status: input.status,
    discountType: input.discountType,
    scope: input.scope,
    validity: input.validity,
  };

  const [coupons, total] = await Promise.all([
    couponRepository.findManyForAdmin(filters, input.page, input.limit, now),
    couponRepository.countForAdmin(filters, now),
  ]);

  return {
    coupons: coupons.map((coupon) => toListItem(coupon, now)),
    pagination: buildPaginationMeta(input.page, input.limit, total),
  };
}

export async function getCouponById(couponId: string): Promise<AdminCouponResponse> {
  const coupon = await requireCoupon(couponId);
  return toDetail(coupon, new Date());
}

/**
 * Updates coupon configuration. After any recorded usage, code, discountType,
 * discountValue, and scope are immutable. Dates, limits, min/max, status, and
 * eligible product/category mappings remain mutable for future redemptions.
 */
export async function updateCoupon(
  couponId: string,
  input: UpdateCouponInput,
): Promise<AdminCouponResponse> {
  const existing = await requireCoupon(couponId);
  const usageCount = existing._count.usages;

  const nextCode = input.code !== undefined ? normalizeCode(input.code) : existing.code;
  const nextDiscountType = input.discountType ?? existing.discountType;
  const nextDiscountValue = input.discountValue ?? formatMoney(existing.discountValue);
  const nextScope = input.scope ?? existing.scope;
  const nextStartsAt = input.startsAt ?? existing.startsAt;
  const nextExpiresAt = input.expiresAt ?? existing.expiresAt;

  assertImmutableFieldsUnchanged(existing, { ...input, code: nextCode }, usageCount);
  assertDiscountCompatible(nextDiscountType, nextDiscountValue);

  if (nextStartsAt >= nextExpiresAt) {
    throw new AppError(422, 'startsAt must be before expiresAt');
  }

  if (nextCode !== existing.code) {
    await assertCodeAvailable(nextCode, couponId);
  }

  const mappings = resolveNextMappings(existing, nextScope, input);

  if (mappings.productIds.length > 0) {
    await assertProductsExist(mappings.productIds);
  }
  if (mappings.categoryIds.length > 0) {
    await assertCategoriesExist(mappings.categoryIds);
  }

  try {
    const updated = await couponRepository.runTransaction(async (tx) => {
      await couponRepository.updateCouponRecord(
        couponId,
        {
          code: nextCode,
          discountType: nextDiscountType,
          discountValue: nextDiscountValue,
          scope: nextScope,
          minimumCartValue:
            input.minimumCartValue !== undefined ? input.minimumCartValue : undefined,
          maximumDiscount: input.maximumDiscount !== undefined ? input.maximumDiscount : undefined,
          startsAt: nextStartsAt,
          expiresAt: nextExpiresAt,
          usageLimit: input.usageLimit !== undefined ? input.usageLimit : undefined,
          perUserLimit: input.perUserLimit !== undefined ? input.perUserLimit : undefined,
          status: input.status,
        },
        tx,
      );

      if (mappings.mappingsChanged) {
        await couponRepository.replaceCouponMappings(
          couponId,
          { productIds: mappings.productIds, categoryIds: mappings.categoryIds },
          tx,
        );
      }

      const refreshed = await couponRepository.findCouponDetailById(couponId, tx);
      if (!refreshed) {
        throw new AppError(500, 'Failed to load coupon after update');
      }
      return refreshed;
    });

    return toDetail(updated, new Date());
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(409, `Coupon code "${nextCode}" already exists`);
    }
    throw error;
  }
}

export async function activateCoupon(couponId: string): Promise<AdminCouponResponse> {
  const coupon = await requireCoupon(couponId);
  assertStructurallyValid(coupon);

  if (coupon.status === CouponStatus.ACTIVE) {
    return toDetail(coupon, new Date());
  }

  const updated = await couponRepository.setCouponStatus(couponId, CouponStatus.ACTIVE);
  return toDetail(updated, new Date());
}

export async function deactivateCoupon(couponId: string): Promise<AdminCouponResponse> {
  const coupon = await requireCoupon(couponId);

  if (coupon.status === CouponStatus.INACTIVE) {
    return toDetail(coupon, new Date());
  }

  const updated = await couponRepository.setCouponStatus(couponId, CouponStatus.INACTIVE);
  return toDetail(updated, new Date());
}

/**
 * Archives a coupon by deactivating it. Hard delete is not exposed because
 * CouponUsage (and future Order snapshots) must remain intact.
 */
export async function archiveCoupon(couponId: string): Promise<AdminCouponResponse> {
  return deactivateCoupon(couponId);
}

export async function listCouponUsages(
  couponId: string,
  page: number,
  limit: number,
): Promise<{ usages: CouponUsageRecord[]; pagination: PaginationMeta }> {
  await requireCoupon(couponId);

  const [usages, total] = await Promise.all([
    couponRepository.findCouponUsages(couponId, page, limit),
    couponRepository.countCouponUsages(couponId),
  ]);

  return {
    usages,
    pagination: buildPaginationMeta(page, limit, total),
  };
}
