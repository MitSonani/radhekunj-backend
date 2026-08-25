import { CategoryStatus, Prisma, ProductStatus, ProductVariantStatus } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { getPaginationOffset } from '../../shared/utils/pagination.js';

// --- Selects ---

const publicCategorySelect = {
  id: true,
  name: true,
  slug: true,
} satisfies Prisma.CategorySelect;

const publicAttributeSelect = {
  id: true,
  name: true,
  slug: true,
} satisfies Prisma.AttributeSelect;

const publicAttributeValueSelect = {
  id: true,
  value: true,
  slug: true,
  colorCode: true,
  attribute: {
    select: publicAttributeSelect,
  },
} satisfies Prisma.AttributeValueSelect;

/**
 * Shared image select used by both list and detail selects.
 * Defines exactly what is safe to expose publicly — no S3 credentials.
 */
const publicImageSelect = {
  id: true,
  objectKey: true,
  altText: true,
  sortOrder: true,
  isPrimary: true,
  attributeValueId: true,
  attributeValue: {
    select: publicAttributeValueSelect,
  },
} satisfies Prisma.ProductImageSelect;

const publicInventorySelect = {
  quantity: true,
  reservedQuantity: true,
} satisfies Prisma.InventorySelect;

const publicVariantSelect = {
  id: true,
  price: true,
  compareAtPrice: true,
  attributes: {
    select: {
      attributeValueId: true,
      attributeValue: {
        select: publicAttributeValueSelect,
      },
    },
  },
  inventory: {
    select: publicInventorySelect,
  },
} satisfies Prisma.ProductVariantSelect;

/**
 * Full detail select for a single product page — includes all images and ACTIVE variants only.
 */
const publicProductDetailSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  basePrice: true,
  category: {
    select: publicCategorySelect,
  },
  images: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    select: publicImageSelect,
  },
  variants: {
    where: { status: ProductVariantStatus.ACTIVE },
    orderBy: { createdAt: 'asc' as const },
    select: publicVariantSelect,
  },
} satisfies Prisma.ProductSelect;

/**
 * Lightweight select for product listing — only the fields required by a product card.
 */
const publicProductListSelect = {
  id: true,
  name: true,
  slug: true,
  basePrice: true,
  category: {
    select: publicCategorySelect,
  },
  images: {
    where: { isPrimary: true },
    take: 1,
    select: publicImageSelect,
  },
} satisfies Prisma.ProductSelect;

// --- Exported record types ---

export type PublicProductDetailRecord = Prisma.ProductGetPayload<{
  select: typeof publicProductDetailSelect;
}>;

export type PublicProductListRecord = Prisma.ProductGetPayload<{
  select: typeof publicProductListSelect;
}>;

export type PublicImageRecord = Prisma.ProductImageGetPayload<{
  select: typeof publicImageSelect;
}>;

export type PublicVariantRecord = Prisma.ProductVariantGetPayload<{
  select: typeof publicVariantSelect;
}>;

// --- Filter and sort types ---

export type PublicProductFilters = {
  search?: string;
  categoryId?: string;
};

export type PublicProductSort = 'newest' | 'price_asc' | 'price_desc';

// --- Internal helpers ---

function buildPublicWhere(filters: PublicProductFilters): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {
    status: ProductStatus.ACTIVE,
  };

  if (filters.categoryId) {
    where.categoryId = filters.categoryId;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { slug: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  return where;
}

function buildPublicOrderBy(
  sort: PublicProductSort,
): Prisma.ProductOrderByWithRelationInput {
  switch (sort) {
    case 'price_asc':
      return { basePrice: 'asc' };
    case 'price_desc':
      return { basePrice: 'desc' };
    case 'newest':
    default:
      return { createdAt: 'desc' };
  }
}

// --- Repository functions ---

export async function findPublicMany(
  filters: PublicProductFilters,
  sort: PublicProductSort,
  page: number,
  limit: number,
): Promise<PublicProductListRecord[]> {
  return prisma.product.findMany({
    where: buildPublicWhere(filters),
    orderBy: buildPublicOrderBy(sort),
    skip: getPaginationOffset(page, limit),
    take: limit,
    select: publicProductListSelect,
  });
}

export async function countPublic(filters: PublicProductFilters): Promise<number> {
  return prisma.product.count({
    where: buildPublicWhere(filters),
  });
}

/**
 * Finds an ACTIVE product by its slug. Returns null if not found or inactive.
 */
export async function findPublicBySlug(slug: string): Promise<PublicProductDetailRecord | null> {
  return prisma.product.findFirst({
    where: { slug, status: ProductStatus.ACTIVE },
    select: publicProductDetailSelect,
  });
}

/**
 * Finds an ACTIVE category by its slug. Returns null if not found or inactive.
 */
export async function findActiveCategoryBySlug(
  slug: string,
): Promise<{ id: string; status: CategoryStatus } | null> {
  return prisma.category.findFirst({
    where: { slug, status: CategoryStatus.ACTIVE },
    select: { id: true, status: true },
  });
}
