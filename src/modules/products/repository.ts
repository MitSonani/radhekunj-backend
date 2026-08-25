import { CategoryStatus, Prisma, ProductStatus } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { getPaginationOffset } from '../../shared/utils/pagination.js';

export type DbClient = Prisma.TransactionClient | typeof prisma;

export async function runTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(fn);
}

const categorySummarySelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
} satisfies Prisma.CategorySelect;

const attributeSummarySelect = {
  id: true,
  name: true,
  slug: true,
} satisfies Prisma.AttributeSelect;

const attributeValueSelect = {
  id: true,
  attributeId: true,
  value: true,
  slug: true,
  colorCode: true,
  attribute: {
    select: attributeSummarySelect,
  },
} satisfies Prisma.AttributeValueSelect;

const productImageSelect = {
  id: true,
  productId: true,
  attributeValueId: true,
  objectKey: true,
  altText: true,
  sortOrder: true,
  isPrimary: true,
  createdAt: true,
  updatedAt: true,
  attributeValue: {
    select: attributeValueSelect,
  },
} satisfies Prisma.ProductImageSelect;

const inventorySelect = {
  id: true,
  variantId: true,
  quantity: true,
  reservedQuantity: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.InventorySelect;

const variantSelect = {
  id: true,
  productId: true,
  sku: true,
  price: true,
  compareAtPrice: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  attributes: {
    select: {
      id: true,
      attributeValueId: true,
      attributeValue: {
        select: attributeValueSelect,
      },
    },
  },
  inventory: {
    select: inventorySelect,
  },
} satisfies Prisma.ProductVariantSelect;

export const productDetailSelect = {
  id: true,
  categoryId: true,
  name: true,
  slug: true,
  description: true,
  basePrice: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  category: {
    select: categorySummarySelect,
  },
  images: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    select: productImageSelect,
  },
  variants: {
    orderBy: { createdAt: 'asc' as const },
    select: variantSelect,
  },
} satisfies Prisma.ProductSelect;

export const productListSelect = {
  id: true,
  categoryId: true,
  name: true,
  slug: true,
  description: true,
  basePrice: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  category: {
    select: categorySummarySelect,
  },
  images: {
    where: { isPrimary: true },
    take: 1,
    select: productImageSelect,
  },
  _count: {
    select: { variants: true },
  },
} satisfies Prisma.ProductSelect;

export type ProductDetailRecord = Prisma.ProductGetPayload<{ select: typeof productDetailSelect }>;
export type ProductListRecord = Prisma.ProductGetPayload<{ select: typeof productListSelect }>;
export type ProductVariantRecord = Prisma.ProductVariantGetPayload<{
  select: typeof variantSelect;
}>;
export type ProductImageRecord = Prisma.ProductImageGetPayload<{
  select: typeof productImageSelect;
}>;
export type InventoryRecord = Prisma.InventoryGetPayload<{ select: typeof inventorySelect }>;
export type AttributeValueWithAttribute = Prisma.AttributeValueGetPayload<{
  select: typeof attributeValueSelect;
}>;

export type ProductListFilters = {
  search?: string;
  status?: ProductStatus;
  categoryId?: string;
  sku?: string;
};

export type CreateProductData = {
  categoryId: string;
  name: string;
  slug: string;
  description?: string | null;
  basePrice: string;
  status?: ProductStatus;
};

export type CreateVariantData = {
  productId: string;
  sku: string;
  price: string;
  compareAtPrice?: string | null;
  status?: Prisma.ProductVariantCreateInput['status'];
  attributeValueIds: string[];
  quantity: number;
  reservedQuantity: number;
};

export type UpdateProductData = {
  categoryId?: string;
  name?: string;
  slug?: string;
  description?: string | null;
  basePrice?: string;
  status?: ProductStatus;
};

export type UpdateVariantData = {
  sku?: string;
  price?: string;
  compareAtPrice?: string | null;
  status?: Prisma.ProductVariantUpdateInput['status'];
};

export type CreateProductImageData = {
  productId: string;
  attributeValueId?: string | null;
  objectKey: string;
  altText?: string | null;
  sortOrder?: number;
  isPrimary?: boolean;
};

export type UpdateProductImageData = {
  attributeValueId?: string | null;
  objectKey?: string;
  altText?: string | null;
  sortOrder?: number;
  isPrimary?: boolean;
};

function buildListWhere(filters: ProductListFilters): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.categoryId) {
    where.categoryId = filters.categoryId;
  }

  if (filters.sku) {
    where.variants = {
      some: {
        sku: { contains: filters.sku, mode: 'insensitive' },
      },
    };
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { slug: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  return where;
}

export async function findById(
  id: string,
  db: DbClient = prisma,
): Promise<ProductDetailRecord | null> {
  return db.product.findUnique({
    where: { id },
    select: productDetailSelect,
  });
}

export async function findBySlug(
  slug: string,
  excludeId?: string,
  db: DbClient = prisma,
): Promise<{ id: string } | null> {
  return db.product.findFirst({
    where: {
      slug,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
}

export async function findMany(
  filters: ProductListFilters,
  page: number,
  limit: number,
): Promise<ProductListRecord[]> {
  return prisma.product.findMany({
    where: buildListWhere(filters),
    orderBy: { createdAt: 'desc' },
    skip: getPaginationOffset(page, limit),
    take: limit,
    select: productListSelect,
  });
}

export async function count(filters: ProductListFilters): Promise<number> {
  return prisma.product.count({
    where: buildListWhere(filters),
  });
}

export async function create(
  data: CreateProductData,
  db: DbClient = prisma,
): Promise<ProductDetailRecord> {
  return db.product.create({
    data,
    select: productDetailSelect,
  });
}

export async function update(
  id: string,
  data: UpdateProductData,
  db: DbClient = prisma,
): Promise<ProductDetailRecord> {
  return db.product.update({
    where: { id },
    data,
    select: productDetailSelect,
  });
}

export async function lockProduct(id: string, db: Prisma.TransactionClient): Promise<void> {
  await db.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
}

export async function findVariantById(
  variantId: string,
  db: DbClient = prisma,
): Promise<ProductVariantRecord | null> {
  return db.productVariant.findUnique({
    where: { id: variantId },
    select: variantSelect,
  });
}

export async function findVariantBySkuInsensitive(
  sku: string,
  excludeId?: string,
  db: DbClient = prisma,
): Promise<{ id: string } | null> {
  return db.productVariant.findFirst({
    where: {
      sku: { equals: sku, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
}

export async function findVariantsByProductId(
  productId: string,
  db: DbClient = prisma,
): Promise<ProductVariantRecord[]> {
  return db.productVariant.findMany({
    where: { productId },
    orderBy: { createdAt: 'asc' },
    select: variantSelect,
  });
}

export async function createVariant(
  data: CreateVariantData,
  db: DbClient = prisma,
): Promise<ProductVariantRecord> {
  return db.productVariant.create({
    data: {
      productId: data.productId,
      sku: data.sku,
      price: data.price,
      compareAtPrice: data.compareAtPrice,
      status: data.status,
      attributes: {
        create: data.attributeValueIds.map((attributeValueId) => ({ attributeValueId })),
      },
      inventory: {
        create: {
          quantity: data.quantity,
          reservedQuantity: data.reservedQuantity,
        },
      },
    },
    select: variantSelect,
  });
}

export async function updateVariant(
  variantId: string,
  data: UpdateVariantData,
  db: DbClient = prisma,
): Promise<ProductVariantRecord> {
  return db.productVariant.update({
    where: { id: variantId },
    data,
    select: variantSelect,
  });
}

export async function replaceVariantAttributes(
  variantId: string,
  attributeValueIds: string[],
  db: DbClient = prisma,
): Promise<ProductVariantRecord> {
  await db.productVariantAttribute.deleteMany({
    where: { variantId },
  });

  if (attributeValueIds.length > 0) {
    await db.productVariantAttribute.createMany({
      data: attributeValueIds.map((attributeValueId) => ({
        variantId,
        attributeValueId,
      })),
    });
  }

  const variant = await findVariantById(variantId, db);

  if (!variant) {
    throw new Error(`Variant ${variantId} was not found after updating attributes`);
  }

  return variant;
}

export async function findAttributeValuesByIds(
  ids: string[],
  db: DbClient = prisma,
): Promise<AttributeValueWithAttribute[]> {
  if (ids.length === 0) {
    return [];
  }

  return db.attributeValue.findMany({
    where: { id: { in: ids } },
    select: attributeValueSelect,
  });
}

export async function findAttributeValueById(
  id: string,
  db: DbClient = prisma,
): Promise<AttributeValueWithAttribute | null> {
  return db.attributeValue.findUnique({
    where: { id },
    select: attributeValueSelect,
  });
}

export async function findCategoryById(
  id: string,
  db: DbClient = prisma,
): Promise<{ id: string; status: CategoryStatus } | null> {
  return db.category.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
}

export async function updateInventory(
  variantId: string,
  data: { quantity?: number; reservedQuantity?: number },
  db: DbClient = prisma,
): Promise<InventoryRecord> {
  return db.inventory.update({
    where: { variantId },
    data,
    select: inventorySelect,
  });
}

export async function findImageById(
  imageId: string,
  db: DbClient = prisma,
): Promise<ProductImageRecord | null> {
  return db.productImage.findUnique({
    where: { id: imageId },
    select: productImageSelect,
  });
}

export async function findPrimaryImage(
  productId: string,
  db: DbClient = prisma,
): Promise<{ id: string } | null> {
  return db.productImage.findFirst({
    where: { productId, isPrimary: true },
    select: { id: true },
  });
}

export async function clearPrimaryImages(
  productId: string,
  excludeImageId?: string,
  db: DbClient = prisma,
): Promise<void> {
  await db.productImage.updateMany({
    where: {
      productId,
      isPrimary: true,
      ...(excludeImageId ? { id: { not: excludeImageId } } : {}),
    },
    data: { isPrimary: false },
  });
}

export async function createImage(
  data: CreateProductImageData,
  db: DbClient = prisma,
): Promise<ProductImageRecord> {
  return db.productImage.create({
    data,
    select: productImageSelect,
  });
}

export async function updateImage(
  imageId: string,
  data: UpdateProductImageData,
  db: DbClient = prisma,
): Promise<ProductImageRecord> {
  return db.productImage.update({
    where: { id: imageId },
    data,
    select: productImageSelect,
  });
}

export async function removeImage(
  imageId: string,
  db: DbClient = prisma,
): Promise<ProductImageRecord> {
  return db.productImage.delete({
    where: { id: imageId },
    select: productImageSelect,
  });
}
