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
  minPrice?: number;
  maxPrice?: number;
  color?: string;
  size?: string;
  inStock?: boolean;
};

export type CatalogFilterOptions = {
  categories: Array<{ id: string; name: string; slug: string }>;
  colors: Array<{ value: string; slug: string; colorCode: string | null }>;
  sizes: Array<{ value: string; slug: string }>;
  priceRange: { min: number; max: number };
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

  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    const priceFilter: Prisma.DecimalFilter = {};
    if (filters.minPrice !== undefined) {
      priceFilter.gte = new Prisma.Decimal(filters.minPrice);
    }
    if (filters.maxPrice !== undefined) {
      priceFilter.lte = new Prisma.Decimal(filters.maxPrice);
    }
    where.basePrice = priceFilter;
  }

  const variantConditions: Prisma.ProductVariantWhereInput[] = [
    { status: ProductVariantStatus.ACTIVE },
  ];

  if (filters.inStock) {
    variantConditions.push({
      inventory: {
        is: {
          quantity: { gt: 0 },
        },
      },
    });
  }

  if (filters.color) {
    const colorLower = filters.color.toLowerCase();
    variantConditions.push({
      attributes: {
        some: {
          attributeValue: {
            OR: [
              { slug: { equals: colorLower } },
              { value: { equals: filters.color, mode: 'insensitive' } },
            ],
          },
        },
      },
    });
  }

  if (filters.size) {
    const sizeLower = filters.size.toLowerCase();
    variantConditions.push({
      attributes: {
        some: {
          attributeValue: {
            OR: [
              { slug: { equals: sizeLower } },
              { value: { equals: filters.size, mode: 'insensitive' } },
            ],
          },
        },
      },
    });
  }

  if (variantConditions.length > 1) {
    where.variants = {
      some: {
        AND: variantConditions,
      },
    };
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


/**
 * Fetches available filter options for public catalog (active categories, colors, sizes, and price bounds).
 */
export async function getCatalogFilterOptions(): Promise<CatalogFilterOptions> {
  const [categories, colors, sizes, priceStats] = await Promise.all([
    prisma.category.findMany({
      where: { status: CategoryStatus.ACTIVE },
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    }),
    prisma.attributeValue.findMany({
      where: {
        attribute: { slug: 'color' },
        variantAttributes: {
          some: {
            variant: {
              status: ProductVariantStatus.ACTIVE,
              product: { status: ProductStatus.ACTIVE },
            },
          },
        },
      },
      select: { value: true, slug: true, colorCode: true },
      distinct: ['slug'],
      orderBy: { value: 'asc' },
    }),
    prisma.attributeValue.findMany({
      where: {
        attribute: { slug: 'size' },
        variantAttributes: {
          some: {
            variant: {
              status: ProductVariantStatus.ACTIVE,
              product: { status: ProductStatus.ACTIVE },
            },
          },
        },
      },
      select: { value: true, slug: true },
      distinct: ['slug'],
      orderBy: { value: 'asc' },
    }),
    prisma.product.aggregate({
      where: { status: ProductStatus.ACTIVE },
      _min: { basePrice: true },
      _max: { basePrice: true },
    }),
  ]);

  return {
    categories,
    colors,
    sizes,
    priceRange: {
      min: priceStats._min.basePrice ? Number(priceStats._min.basePrice) : 0,
      max: priceStats._max.basePrice ? Number(priceStats._max.basePrice) : 50000,
    },
  };
}
