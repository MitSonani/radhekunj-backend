import { CouponDiscountType, CouponScope, CouponStatus, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { getPaginationOffset } from '../../shared/utils/pagination.js';

export type DbClient = Prisma.TransactionClient | typeof prisma;

const couponProductSelect = {
  productId: true,
} satisfies Prisma.CouponProductSelect;

const couponCategorySelect = {
  categoryId: true,
} satisfies Prisma.CouponCategorySelect;

const couponSelect = {
  id: true,
  code: true,
  discountType: true,
  discountValue: true,
  scope: true,
  minimumCartValue: true,
  maximumDiscount: true,
  startsAt: true,
  expiresAt: true,
  usageLimit: true,
  perUserLimit: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  products: {
    select: couponProductSelect,
  },
  categories: {
    select: couponCategorySelect,
  },
} satisfies Prisma.CouponSelect;

export type CouponRecord = Prisma.CouponGetPayload<{ select: typeof couponSelect }>;

export async function findCouponByCode(
  code: string,
  db: DbClient = prisma,
): Promise<CouponRecord | null> {
  return db.coupon.findUnique({
    where: { code },
    select: couponSelect,
  });
}

export async function findCouponById(
  couponId: string,
  db: DbClient = prisma,
): Promise<CouponRecord | null> {
  return db.coupon.findUnique({
    where: { id: couponId },
    select: couponSelect,
  });
}

export async function countCouponUsages(
  couponId: string,
  db: DbClient = prisma,
): Promise<number> {
  return db.couponUsage.count({ where: { couponId } });
}

export async function countUserCouponUsages(
  couponId: string,
  userId: string,
  db: DbClient = prisma,
): Promise<number> {
  return db.couponUsage.count({ where: { couponId, userId } });
}

export async function createCouponUsage(
  data: {
    couponId: string;
    userId: string;
    orderId: string | null;
    discountAmount: Prisma.Decimal;
  },
  db: DbClient = prisma,
): Promise<void> {
  await db.couponUsage.create({
    data: {
      couponId: data.couponId,
      userId: data.userId,
      orderId: data.orderId,
      discountAmount: data.discountAmount,
    },
  });
}

/**
 * Acquires a row-level lock on the coupon so concurrent order transactions
 * serialise usage-limit checks. Must run inside a transaction.
 */
export async function lockCouponRow(
  couponId: string,
  db: Prisma.TransactionClient,
): Promise<void> {
  await db.$queryRaw`SELECT id FROM coupons WHERE id = ${couponId}::uuid FOR UPDATE`;
}

export async function runTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(fn);
}

// ---------------------------------------------------------------------------
// Admin list / detail selects
// ---------------------------------------------------------------------------

const adminProductSummarySelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
} satisfies Prisma.ProductSelect;

const adminCategorySummarySelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
} satisfies Prisma.CategorySelect;

const adminCouponListSelect = {
  id: true,
  code: true,
  discountType: true,
  discountValue: true,
  scope: true,
  minimumCartValue: true,
  maximumDiscount: true,
  startsAt: true,
  expiresAt: true,
  usageLimit: true,
  perUserLimit: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: { usages: true },
  },
} satisfies Prisma.CouponSelect;

const adminCouponDetailSelect = {
  ...adminCouponListSelect,
  products: {
    select: {
      productId: true,
      product: { select: adminProductSummarySelect },
    },
  },
  categories: {
    select: {
      categoryId: true,
      category: { select: adminCategorySummarySelect },
    },
  },
} satisfies Prisma.CouponSelect;

const couponUsageSelect = {
  id: true,
  couponId: true,
  userId: true,
  orderId: true,
  discountAmount: true,
  createdAt: true,
} satisfies Prisma.CouponUsageSelect;

export type AdminCouponListRecord = Prisma.CouponGetPayload<{ select: typeof adminCouponListSelect }>;
export type AdminCouponDetailRecord = Prisma.CouponGetPayload<{
  select: typeof adminCouponDetailSelect;
}>;
export type CouponUsageRecord = Prisma.CouponUsageGetPayload<{ select: typeof couponUsageSelect }>;

export type CouponListFilters = {
  search?: string;
  status?: CouponStatus;
  discountType?: CouponDiscountType;
  scope?: CouponScope;
  validity?: 'CURRENT' | 'UPCOMING' | 'EXPIRED';
};

function buildListWhere(filters: CouponListFilters, now: Date): Prisma.CouponWhereInput {
  const where: Prisma.CouponWhereInput = {};

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.discountType) {
    where.discountType = filters.discountType;
  }

  if (filters.scope) {
    where.scope = filters.scope;
  }

  if (filters.search) {
    where.code = { contains: filters.search, mode: 'insensitive' };
  }

  if (filters.validity === 'CURRENT') {
    where.startsAt = { lte: now };
    where.expiresAt = { gte: now };
  } else if (filters.validity === 'UPCOMING') {
    where.startsAt = { gt: now };
  } else if (filters.validity === 'EXPIRED') {
    where.expiresAt = { lt: now };
  }

  return where;
}

export async function findManyForAdmin(
  filters: CouponListFilters,
  page: number,
  limit: number,
  now: Date,
): Promise<AdminCouponListRecord[]> {
  return prisma.coupon.findMany({
    where: buildListWhere(filters, now),
    orderBy: { createdAt: 'desc' },
    skip: getPaginationOffset(page, limit),
    take: limit,
    select: adminCouponListSelect,
  });
}

export async function countForAdmin(filters: CouponListFilters, now: Date): Promise<number> {
  return prisma.coupon.count({
    where: buildListWhere(filters, now),
  });
}

export async function findCouponDetailById(
  couponId: string,
  db: DbClient = prisma,
): Promise<AdminCouponDetailRecord | null> {
  return db.coupon.findUnique({
    where: { id: couponId },
    select: adminCouponDetailSelect,
  });
}

export async function findProductIds(ids: string[]): Promise<string[]> {
  const rows = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

export async function findCategoryIds(ids: string[]): Promise<string[]> {
  const rows = await prisma.category.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

export type CreateCouponData = {
  code: string;
  discountType: CouponDiscountType;
  discountValue: Prisma.Decimal | string;
  scope: CouponScope;
  minimumCartValue?: Prisma.Decimal | string | null;
  maximumDiscount?: Prisma.Decimal | string | null;
  startsAt: Date;
  expiresAt: Date;
  usageLimit?: number | null;
  perUserLimit?: number | null;
  status?: CouponStatus;
  productIds?: string[];
  categoryIds?: string[];
};

export async function createCouponWithMappings(
  data: CreateCouponData,
  db: DbClient = prisma,
): Promise<AdminCouponDetailRecord> {
  return db.coupon.create({
    data: {
      code: data.code,
      discountType: data.discountType,
      discountValue: data.discountValue,
      scope: data.scope,
      minimumCartValue: data.minimumCartValue ?? null,
      maximumDiscount: data.maximumDiscount ?? null,
      startsAt: data.startsAt,
      expiresAt: data.expiresAt,
      usageLimit: data.usageLimit ?? null,
      perUserLimit: data.perUserLimit ?? null,
      status: data.status,
      products: data.productIds
        ? { create: data.productIds.map((productId) => ({ productId })) }
        : undefined,
      categories: data.categoryIds
        ? { create: data.categoryIds.map((categoryId) => ({ categoryId })) }
        : undefined,
    },
    select: adminCouponDetailSelect,
  });
}

export type UpdateCouponData = {
  code?: string;
  discountType?: CouponDiscountType;
  discountValue?: Prisma.Decimal | string;
  scope?: CouponScope;
  minimumCartValue?: Prisma.Decimal | string | null;
  maximumDiscount?: Prisma.Decimal | string | null;
  startsAt?: Date;
  expiresAt?: Date;
  usageLimit?: number | null;
  perUserLimit?: number | null;
  status?: CouponStatus;
};

export async function updateCouponRecord(
  couponId: string,
  data: UpdateCouponData,
  db: DbClient = prisma,
): Promise<void> {
  await db.coupon.update({
    where: { id: couponId },
    data,
  });
}

export async function replaceCouponMappings(
  couponId: string,
  mappings: { productIds: string[]; categoryIds: string[] },
  db: DbClient = prisma,
): Promise<void> {
  await db.couponProduct.deleteMany({ where: { couponId } });
  await db.couponCategory.deleteMany({ where: { couponId } });

  if (mappings.productIds.length > 0) {
    await db.couponProduct.createMany({
      data: mappings.productIds.map((productId) => ({ couponId, productId })),
    });
  }

  if (mappings.categoryIds.length > 0) {
    await db.couponCategory.createMany({
      data: mappings.categoryIds.map((categoryId) => ({ couponId, categoryId })),
    });
  }
}

export async function setCouponStatus(
  couponId: string,
  status: CouponStatus,
  db: DbClient = prisma,
): Promise<AdminCouponDetailRecord> {
  return db.coupon.update({
    where: { id: couponId },
    data: { status },
    select: adminCouponDetailSelect,
  });
}

export async function findCouponUsages(
  couponId: string,
  page: number,
  limit: number,
): Promise<CouponUsageRecord[]> {
  return prisma.couponUsage.findMany({
    where: { couponId },
    orderBy: { createdAt: 'desc' },
    skip: getPaginationOffset(page, limit),
    take: limit,
    select: couponUsageSelect,
  });
}
