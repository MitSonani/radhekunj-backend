import { Prisma, ProductStatus, ProductVariantStatus } from '@prisma/client';
import { AppError, NotFoundError, ValidationError } from '../../shared/errors/appError.js';
import { generateSlug, withSlugSuffix } from '../../shared/utils/slug.js';
import { buildPaginationMeta } from '../../shared/utils/pagination.js';
import { PRODUCT, PRODUCT_IMAGE } from '../../shared/constants/index.js';
import {
  assertObjectExists,
  buildProductImageKey,
  buildPublicUrl,
  createPresignedUploadUrl,
  deleteObjectIfExists,
  parseProductImageKey,
  type AllowedImageMimeType,
  type PresignedUploadResult,
} from '../../shared/services/s3.js';
import * as productRepository from './repository.js';
import type {
  AttributeValueWithAttribute,
  CreateVariantData,
  DbClient,
  InventoryRecord,
  ProductDetailRecord,
  ProductImageRecord,
  ProductListRecord,
  ProductVariantRecord,
  UpdateProductData,
  UpdateVariantData,
} from './repository.js';
import { PaginationMeta } from '../../shared/types/index.js';

export type AttributeSummary = {
  id: string;
  name: string;
  slug: string;
};

export type AttributeValueSummary = {
  id: string;
  attributeId: string;
  value: string;
  slug: string;
  colorCode: string | null;
  attribute: AttributeSummary;
};

export type InventoryResponse = {
  id: string;
  variantId: string;
  quantity: number;
  reservedQuantity: number;
  createdAt: Date;
  updatedAt: Date;
};

export type VariantAttributeResponse = {
  id: string;
  attributeValueId: string;
  attributeValue: AttributeValueSummary;
};

export type ProductVariantResponse = {
  id: string;
  productId: string;
  sku: string;
  price: string;
  compareAtPrice: string | null;
  status: ProductVariantStatus;
  attributes: VariantAttributeResponse[];
  inventory: InventoryResponse | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductImageResponse = {
  id: string;
  productId: string;
  objectKey: string;
  imageUrl: string;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
  attributeValueId: string | null;
  attributeValue: AttributeValueSummary | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CategorySummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

export type ProductDetail = {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  basePrice: string;
  status: ProductStatus;
  category: CategorySummary;
  images: ProductImageResponse[];
  variants: ProductVariantResponse[];
  createdAt: Date;
  updatedAt: Date;
};

export type ProductListItem = {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  basePrice: string;
  status: ProductStatus;
  category: CategorySummary;
  primaryImage: ProductImageResponse | null;
  variantCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateVariantInput = {
  sku: string;
  price: string;
  compareAtPrice?: string | null;
  status?: ProductVariantStatus;
  attributeValueIds: string[];
  inventory: {
    quantity: number;
    reservedQuantity?: number;
  };
};

export type CreateProductInput = {
  categoryId: string;
  name: string;
  description?: string | null;
  basePrice: string;
  status?: ProductStatus;
  variants?: CreateVariantInput[];
};

export type UpdateProductInput = {
  categoryId?: string;
  name?: string;
  description?: string | null;
  basePrice?: string;
  status?: ProductStatus;
};

export type ListProductsInput = {
  page: number;
  limit: number;
  search?: string;
  status?: ProductStatus;
  categoryId?: string;
  sku?: string;
};

export type UpdateVariantInput = {
  sku?: string;
  price?: string;
  compareAtPrice?: string | null;
  status?: ProductVariantStatus;
  attributeValueIds?: string[];
};

export type SetInventoryInput = {
  quantity?: number;
  reservedQuantity?: number;
};

export type CreateProductImageInput = {
  objectKey: string;
  attributeValueId?: string | null;
  altText?: string | null;
  sortOrder?: number;
  isPrimary?: boolean;
};

export type UpdateProductImageInput = {
  objectKey?: string;
  attributeValueId?: string | null;
  altText?: string | null;
  sortOrder?: number;
  isPrimary?: boolean;
};

function formatMoney(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function formatMoneyOrNull(value: Prisma.Decimal | null): string | null {
  return value === null ? null : formatMoney(value);
}

function toAttributeValue(value: AttributeValueWithAttribute): AttributeValueSummary {
  return {
    id: value.id,
    attributeId: value.attributeId,
    value: value.value,
    slug: value.slug,
    colorCode: value.colorCode,
    attribute: {
      id: value.attribute.id,
      name: value.attribute.name,
      slug: value.attribute.slug,
    },
  };
}

function toInventory(inventory: InventoryRecord): InventoryResponse {
  return {
    id: inventory.id,
    variantId: inventory.variantId,
    quantity: inventory.quantity,
    reservedQuantity: inventory.reservedQuantity,
    createdAt: inventory.createdAt,
    updatedAt: inventory.updatedAt,
  };
}

function toImage(image: ProductImageRecord): ProductImageResponse {
  return {
    id: image.id,
    productId: image.productId,
    objectKey: image.objectKey,
    imageUrl: buildPublicUrl(image.objectKey),
    altText: image.altText,
    sortOrder: image.sortOrder,
    isPrimary: image.isPrimary,
    attributeValueId: image.attributeValueId,
    attributeValue: image.attributeValue ? toAttributeValue(image.attributeValue) : null,
    createdAt: image.createdAt,
    updatedAt: image.updatedAt,
  };
}

function toVariant(variant: ProductVariantRecord): ProductVariantResponse {
  return {
    id: variant.id,
    productId: variant.productId,
    sku: variant.sku,
    price: formatMoney(variant.price),
    compareAtPrice: formatMoneyOrNull(variant.compareAtPrice),
    status: variant.status,
    attributes: variant.attributes.map((attribute) => ({
      id: attribute.id,
      attributeValueId: attribute.attributeValueId,
      attributeValue: toAttributeValue(attribute.attributeValue),
    })),
    inventory: variant.inventory ? toInventory(variant.inventory) : null,
    createdAt: variant.createdAt,
    updatedAt: variant.updatedAt,
  };
}

function toProductDetail(record: ProductDetailRecord): ProductDetail {
  return {
    id: record.id,
    categoryId: record.categoryId,
    name: record.name,
    slug: record.slug,
    description: record.description,
    basePrice: formatMoney(record.basePrice),
    status: record.status,
    category: record.category,
    images: record.images.map(toImage),
    variants: record.variants.map(toVariant),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toProductListItem(record: ProductListRecord): ProductListItem {
  const primaryImage = record.images[0];

  return {
    id: record.id,
    categoryId: record.categoryId,
    name: record.name,
    slug: record.slug,
    description: record.description,
    basePrice: formatMoney(record.basePrice),
    status: record.status,
    category: record.category,
    primaryImage: primaryImage ? toImage(primaryImage) : null,
    variantCount: record._count.variants,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function uniqueConstraintTargets(error: Prisma.PrismaClientKnownRequestError): string[] {
  const target = error.meta?.['target'];

  if (Array.isArray(target)) {
    return target.filter((value): value is string => typeof value === 'string');
  }

  if (typeof target === 'string') {
    return [target];
  }

  return [];
}

function slugFromName(name: string): string {
  const slug = generateSlug(name);

  if (!slug) {
    throw new ValidationError('Product name must contain letters or numbers');
  }

  return slug;
}

function combinationFingerprint(attributeValueIds: string[]): string {
  return [...attributeValueIds].sort().join(',');
}

async function ensureUniqueSlug(baseSlug: string, excludeId?: string): Promise<string> {
  const existingBase = await productRepository.findBySlug(baseSlug, excludeId);

  if (!existingBase) {
    return baseSlug;
  }

  for (let suffix = 2; suffix <= 1000; suffix += 1) {
    const candidate = withSlugSuffix(baseSlug, suffix);
    const existing = await productRepository.findBySlug(candidate, excludeId);

    if (!existing) {
      return candidate;
    }
  }

  throw new AppError(500, 'Unable to generate a unique product slug');
}

async function ensureUniqueSku(sku: string, excludeId?: string): Promise<void> {
  const existing = await productRepository.findVariantBySkuInsensitive(sku, excludeId);

  if (existing) {
    throw new AppError(409, `SKU "${sku}" already exists`);
  }
}

async function ensureCategoryExists(categoryId: string, db?: DbClient): Promise<void> {
  const category = await productRepository.findCategoryById(categoryId, db);

  if (!category) {
    throw new ValidationError(`Category with ID "${categoryId}" not found`);
  }
}

async function loadAttributeValues(
  attributeValueIds: string[],
  db?: DbClient,
): Promise<AttributeValueWithAttribute[]> {
  const uniqueIds = [...new Set(attributeValueIds)];

  if (uniqueIds.length !== attributeValueIds.length) {
    throw new ValidationError('A variant cannot contain duplicate attribute values');
  }

  const values = await productRepository.findAttributeValuesByIds(attributeValueIds, db);

  if (values.length !== attributeValueIds.length) {
    throw new ValidationError('One or more attribute values are invalid');
  }

  const attributeIds = values.map((value) => value.attributeId);

  if (new Set(attributeIds).size !== attributeIds.length) {
    throw new ValidationError('A variant cannot contain multiple values for the same attribute');
  }

  return values;
}

async function ensureUniqueVariantCombination(
  productId: string,
  attributeValueIds: string[],
  excludeVariantId?: string,
  db?: DbClient,
): Promise<void> {
  const fingerprint = combinationFingerprint(attributeValueIds);
  const existingVariants = await productRepository.findVariantsByProductId(productId, db);

  const duplicate = existingVariants.some((variant) => {
    if (excludeVariantId && variant.id === excludeVariantId) {
      return false;
    }

    const existingFingerprint = combinationFingerprint(
      variant.attributes.map((attribute) => attribute.attributeValueId),
    );

    return existingFingerprint === fingerprint;
  });

  if (duplicate) {
    throw new AppError(409, 'A variant with this attribute combination already exists');
  }
}

async function ensureColorAttributeValue(
  attributeValueId: string,
  db?: DbClient,
): Promise<AttributeValueWithAttribute> {
  const value = await productRepository.findAttributeValueById(attributeValueId, db);

  if (!value) {
    throw new ValidationError(`Attribute value with ID "${attributeValueId}" not found`);
  }

  if (value.attribute.slug !== PRODUCT.COLOR_ATTRIBUTE_SLUG) {
    throw new ValidationError('Product images can only be associated with Color attribute values');
  }

  return value;
}

function assertImageKeyForProduct(
  objectKey: string,
  productId: string,
): NonNullable<ReturnType<typeof parseProductImageKey>> {
  const parsed = parseProductImageKey(objectKey);

  if (!parsed || parsed.productId !== productId) {
    throw new AppError(400, 'Invalid image key');
  }

  return parsed;
}

function resolveImageAttributeValueId(
  parsedAttributeValueId: string | undefined,
  requestedAttributeValueId: string | null | undefined,
): string | null {
  if (
    parsedAttributeValueId &&
    requestedAttributeValueId &&
    parsedAttributeValueId !== requestedAttributeValueId
  ) {
    throw new ValidationError('Image key color does not match the supplied attribute value');
  }

  return requestedAttributeValueId === undefined
    ? (parsedAttributeValueId ?? null)
    : requestedAttributeValueId;
}

function toCreateVariantData(productId: string, input: CreateVariantInput): CreateVariantData {
  return {
    productId,
    sku: input.sku,
    price: input.price,
    compareAtPrice: input.compareAtPrice,
    status: input.status,
    attributeValueIds: input.attributeValueIds,
    quantity: input.inventory.quantity,
    reservedQuantity: input.inventory.reservedQuantity ?? 0,
  };
}

/**
 * Creates a product and optional variants/inventory in a single transaction.
 */
export async function createProduct(input: CreateProductInput): Promise<ProductDetail> {
  await ensureCategoryExists(input.categoryId);

  const slug = await ensureUniqueSlug(slugFromName(input.name));
  const variants = input.variants ?? [];
  const skuSet = new Set<string>();

  for (const variant of variants) {
    const normalizedSku = variant.sku.toLowerCase();

    if (skuSet.has(normalizedSku)) {
      throw new AppError(409, `SKU "${variant.sku}" already exists`);
    }

    skuSet.add(normalizedSku);
    await ensureUniqueSku(variant.sku);
    await loadAttributeValues(variant.attributeValueIds);
  }

  const combinationSet = new Set<string>();

  for (const variant of variants) {
    const fingerprint = combinationFingerprint(variant.attributeValueIds);

    if (combinationSet.has(fingerprint)) {
      throw new AppError(409, 'A variant with this attribute combination already exists');
    }

    combinationSet.add(fingerprint);
  }

  try {
    const product = await prismaTransaction(async (tx) => {
      const created = await productRepository.create(
        {
          categoryId: input.categoryId,
          name: input.name,
          slug,
          description: input.description ?? null,
          basePrice: input.basePrice,
          status: input.status,
        },
        tx,
      );

      for (const variant of variants) {
        await productRepository.createVariant(toCreateVariantData(created.id, variant), tx);
      }

      const detail = await productRepository.findById(created.id, tx);

      if (!detail) {
        throw new AppError(500, 'Failed to load created product');
      }

      return detail;
    });

    return toProductDetail(product);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const targets = uniqueConstraintTargets(error);

      if (targets.includes('sku')) {
        throw new AppError(409, 'SKU already exists');
      }

      if (targets.includes('slug')) {
        throw new AppError(409, `Product slug "${slug}" already exists`);
      }

      throw new AppError(409, 'Product could not be created because of a uniqueness conflict');
    }

    throw error;
  }
}

export async function listProducts(
  input: ListProductsInput,
): Promise<{ products: ProductListItem[]; pagination: PaginationMeta }> {
  const filters = {
    search: input.search,
    status: input.status,
    categoryId: input.categoryId,
    sku: input.sku,
  };

  const [records, total] = await Promise.all([
    productRepository.findMany(filters, input.page, input.limit),
    productRepository.count(filters),
  ]);

  return {
    products: records.map(toProductListItem),
    pagination: buildPaginationMeta(input.page, input.limit, total),
  };
}

export async function getProductById(id: string): Promise<ProductDetail> {
  const product = await productRepository.findById(id);

  if (!product) {
    throw new NotFoundError(`Product with ID "${id}" not found`);
  }

  return toProductDetail(product);
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<ProductDetail> {
  const existing = await getProductById(id);
  const data: UpdateProductData = {};

  if (input.categoryId !== undefined && input.categoryId !== existing.categoryId) {
    await ensureCategoryExists(input.categoryId);
    data.categoryId = input.categoryId;
  }

  if (input.name !== undefined && input.name !== existing.name) {
    data.name = input.name;
    data.slug = await ensureUniqueSlug(slugFromName(input.name), id);
  }

  if (input.description !== undefined) {
    data.description = input.description;
  }

  if (input.basePrice !== undefined) {
    data.basePrice = input.basePrice;
  }

  if (input.status !== undefined) {
    data.status = input.status;
  }

  try {
    return toProductDetail(await productRepository.update(id, data));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(409, `Product slug already exists`);
    }

    throw error;
  }
}

/**
 * Deactivates a product. Related variants, inventory, and images are retained.
 */
export async function deactivateProduct(id: string): Promise<ProductDetail> {
  await getProductById(id);
  return toProductDetail(await productRepository.update(id, { status: ProductStatus.INACTIVE }));
}

export async function createVariant(
  productId: string,
  input: CreateVariantInput,
): Promise<ProductVariantResponse> {
  await getProductById(productId);
  await ensureUniqueSku(input.sku);
  await loadAttributeValues(input.attributeValueIds);

  try {
    const variant = await prismaTransaction(async (tx) => {
      await productRepository.lockProduct(productId, tx);
      await ensureUniqueVariantCombination(productId, input.attributeValueIds, undefined, tx);
      return productRepository.createVariant(toCreateVariantData(productId, input), tx);
    });

    return toVariant(variant);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(409, `SKU "${input.sku}" already exists`);
    }

    throw error;
  }
}

export async function updateVariant(
  productId: string,
  variantId: string,
  input: UpdateVariantInput,
): Promise<ProductVariantResponse> {
  const existing = await getVariantForProduct(productId, variantId);
  const data: UpdateVariantData = {};

  if (input.sku !== undefined && input.sku !== existing.sku) {
    await ensureUniqueSku(input.sku, variantId);
    data.sku = input.sku;
  }

  if (input.price !== undefined) {
    data.price = input.price;
  }

  if (input.compareAtPrice !== undefined) {
    data.compareAtPrice = input.compareAtPrice;
  }

  if (input.status !== undefined) {
    data.status = input.status;
  }

  try {
    const variant = await prismaTransaction(async (tx) => {
      if (input.attributeValueIds !== undefined) {
        await loadAttributeValues(input.attributeValueIds, tx);
        await productRepository.lockProduct(productId, tx);
        await ensureUniqueVariantCombination(productId, input.attributeValueIds, variantId, tx);
        await productRepository.updateVariant(variantId, data, tx);
        return productRepository.replaceVariantAttributes(variantId, input.attributeValueIds, tx);
      }

      return productRepository.updateVariant(variantId, data, tx);
    });

    return toVariant(variant);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(409, `SKU "${input.sku ?? existing.sku}" already exists`);
    }

    throw error;
  }
}

export async function deactivateVariant(
  productId: string,
  variantId: string,
): Promise<ProductVariantResponse> {
  await getVariantForProduct(productId, variantId);
  return toVariant(
    await productRepository.updateVariant(variantId, { status: ProductVariantStatus.INACTIVE }),
  );
}

export async function setInventory(
  productId: string,
  variantId: string,
  input: SetInventoryInput,
): Promise<InventoryResponse> {
  const variant = await getVariantForProduct(productId, variantId);
  const current = variant.inventory;

  if (!current) {
    throw new AppError(500, 'Inventory record is missing for this variant');
  }

  const quantity = input.quantity ?? current.quantity;
  const reservedQuantity = input.reservedQuantity ?? current.reservedQuantity;

  if (reservedQuantity > quantity) {
    throw new ValidationError('Reserved quantity cannot exceed quantity');
  }

  return toInventory(
    await productRepository.updateInventory(variantId, {
      ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
      ...(input.reservedQuantity !== undefined ? { reservedQuantity: input.reservedQuantity } : {}),
    }),
  );
}

export async function adjustInventory(
  productId: string,
  variantId: string,
  quantityDelta: number,
): Promise<InventoryResponse> {
  const variant = await getVariantForProduct(productId, variantId);
  const current = variant.inventory;

  if (!current) {
    throw new AppError(500, 'Inventory record is missing for this variant');
  }

  const nextQuantity = current.quantity + quantityDelta;

  if (nextQuantity < 0) {
    throw new ValidationError('Quantity cannot be negative');
  }

  if (current.reservedQuantity > nextQuantity) {
    throw new ValidationError('Reserved quantity cannot exceed quantity');
  }

  return toInventory(
    await productRepository.updateInventory(variantId, { quantity: nextQuantity }),
  );
}

export async function createProductImageUploadUrl(
  productId: string,
  input: {
    contentType: AllowedImageMimeType;
    fileSize: number;
    attributeValueId?: string;
  },
): Promise<PresignedUploadResult> {
  await getProductById(productId);

  if (input.attributeValueId) {
    await ensureColorAttributeValue(input.attributeValueId);
  }

  const objectKey = buildProductImageKey(productId, input.contentType, input.attributeValueId);

  return createPresignedUploadUrl({
    contentType: input.contentType,
    fileSize: input.fileSize,
    objectKey,
    expiresIn: PRODUCT_IMAGE.PRESIGNED_URL_EXPIRES_IN,
  });
}

export async function createProductImage(
  productId: string,
  input: CreateProductImageInput,
): Promise<ProductImageResponse> {
  await getProductById(productId);

  const parsed = assertImageKeyForProduct(input.objectKey, productId);
  const attributeValueId = resolveImageAttributeValueId(
    parsed.attributeValueId,
    input.attributeValueId,
  );

  if (attributeValueId) {
    await ensureColorAttributeValue(attributeValueId);
  }

  await assertObjectExists(input.objectKey);

  try {
    const image = await prismaTransaction(async (tx) => {
      const existingPrimary = await productRepository.findPrimaryImage(productId, tx);
      const isPrimary = input.isPrimary ?? !existingPrimary;

      if (isPrimary) {
        await productRepository.clearPrimaryImages(productId, undefined, tx);
      }

      return productRepository.createImage(
        {
          productId,
          objectKey: input.objectKey,
          attributeValueId,
          altText: input.altText ?? null,
          sortOrder: input.sortOrder ?? 0,
          isPrimary,
        },
        tx,
      );
    });

    return toImage(image);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(409, 'A product can have only one primary image');
    }

    throw error;
  }
}

export async function updateProductImage(
  productId: string,
  imageId: string,
  input: UpdateProductImageInput,
): Promise<ProductImageResponse> {
  const existing = await getImageForProduct(productId, imageId);
  let nextObjectKey = existing.objectKey;
  let previousObjectKey: string | null = null;
  let nextAttributeValueId: string | null | undefined;

  if (input.objectKey !== undefined && input.objectKey !== existing.objectKey) {
    const parsed = assertImageKeyForProduct(input.objectKey, productId);
    nextAttributeValueId = resolveImageAttributeValueId(
      parsed.attributeValueId,
      input.attributeValueId,
    );

    if (nextAttributeValueId) {
      await ensureColorAttributeValue(nextAttributeValueId);
    }

    await assertObjectExists(input.objectKey);
    nextObjectKey = input.objectKey;
    previousObjectKey = existing.objectKey;
  } else if (input.attributeValueId !== undefined) {
    const parsed = assertImageKeyForProduct(existing.objectKey, productId);
    nextAttributeValueId = resolveImageAttributeValueId(
      parsed.attributeValueId,
      input.attributeValueId,
    );

    if (nextAttributeValueId) {
      await ensureColorAttributeValue(nextAttributeValueId);
    }
  }

  try {
    const image = await prismaTransaction(async (tx) => {
      if (input.isPrimary === true) {
        await productRepository.clearPrimaryImages(productId, imageId, tx);
      }

      return productRepository.updateImage(
        imageId,
        {
          ...(input.objectKey !== undefined ? { objectKey: nextObjectKey } : {}),
          ...(nextAttributeValueId !== undefined ? { attributeValueId: nextAttributeValueId } : {}),
          ...(input.altText !== undefined ? { altText: input.altText } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
        },
        tx,
      );
    });

    if (previousObjectKey) {
      await deleteObjectIfExists(previousObjectKey);
    }

    return toImage(image);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(409, 'A product can have only one primary image');
    }

    throw error;
  }
}

export async function deleteProductImage(productId: string, imageId: string): Promise<void> {
  const existing = await getImageForProduct(productId, imageId);
  await productRepository.removeImage(imageId);
  await deleteObjectIfExists(existing.objectKey);
}

async function getVariantForProduct(
  productId: string,
  variantId: string,
): Promise<ProductVariantRecord> {
  await getProductById(productId);

  const variant = await productRepository.findVariantById(variantId);

  if (!variant || variant.productId !== productId) {
    throw new NotFoundError(`Variant with ID "${variantId}" not found`);
  }

  return variant;
}

async function getImageForProduct(productId: string, imageId: string): Promise<ProductImageRecord> {
  await getProductById(productId);

  const image = await productRepository.findImageById(imageId);

  if (!image || image.productId !== productId) {
    throw new NotFoundError(`Product image with ID "${imageId}" not found`);
  }

  return image;
}

async function prismaTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return productRepository.runTransaction(fn);
}
