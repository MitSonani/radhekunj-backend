import { Prisma } from '@prisma/client';
import { NotFoundError } from '../../shared/errors/appError.js';
import { buildPaginationMeta } from '../../shared/utils/pagination.js';
import { buildPublicUrl } from '../../shared/services/s3.js';
import type { PaginationMeta } from '../../shared/types/index.js';
import * as catalogRepository from './repository.js';
import type {
  PublicImageRecord,
  PublicProductDetailRecord,
  PublicProductFilters,
  PublicProductListRecord,
  PublicProductSort,
  PublicVariantRecord,
} from './repository.js';

// --- Public response types ---

export type ProductAvailability = 'IN_STOCK' | 'OUT_OF_STOCK';

export type PublicCategorySummary = {
  id: string;
  name: string;
  slug: string;
};

export type PublicAttributeSummary = {
  id: string;
  name: string;
  slug: string;
};

export type PublicAttributeValueSummary = {
  id: string;
  value: string;
  slug: string;
  colorCode: string | null;
};

export type PublicImageItem = {
  id: string;
  url: string;
  altText: string | null;
  sortOrder: number;
  attributeValueId: string | null;
  attributeValue:
    | (PublicAttributeValueSummary & { attribute: PublicAttributeSummary })
    | null;
};

export type PublicVariantAttribute = {
  attribute: PublicAttributeSummary;
  attributeValue: PublicAttributeValueSummary;
};

export type PublicVariant = {
  id: string;
  price: string;
  compareAtPrice: string | null;
  availability: ProductAvailability;
  attributes: PublicVariantAttribute[];
};

export type PublicAttributeGroup = {
  attribute: PublicAttributeSummary;
  values: PublicAttributeValueSummary[];
};

export type PublicProductListItem = {
  id: string;
  name: string;
  slug: string;
  price: string;
  category: PublicCategorySummary;
  primaryImage: PublicImageItem | null;
};

export type PublicProductDetail = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: string;
  category: PublicCategorySummary;
  images: PublicImageItem[];
  variants: PublicVariant[];
  availableOptions: PublicAttributeGroup[];
};

export type ListPublicProductsInput = {
  page: number;
  limit: number;
  search?: string;
  categorySlug?: string;
  sort: PublicProductSort;
};

// --- Internal helpers ---

function formatMoney(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function formatMoneyOrNull(value: Prisma.Decimal | null): string | null {
  return value === null ? null : formatMoney(value);
}

function computeAvailability(
  inventory: { quantity: number; reservedQuantity: number } | null,
): ProductAvailability {
  if (!inventory) {
    return 'OUT_OF_STOCK';
  }

  const available = inventory.quantity - inventory.reservedQuantity;
  return available > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK';
}

function toPublicImage(image: PublicImageRecord): PublicImageItem {
  return {
    id: image.id,
    url: buildPublicUrl(image.objectKey),
    altText: image.altText,
    sortOrder: image.sortOrder,
    attributeValueId: image.attributeValueId,
    attributeValue: image.attributeValue
      ? {
          id: image.attributeValue.id,
          value: image.attributeValue.value,
          slug: image.attributeValue.slug,
          colorCode: image.attributeValue.colorCode,
          attribute: image.attributeValue.attribute,
        }
      : null,
  };
}

function toPublicVariant(variant: PublicVariantRecord): PublicVariant {
  return {
    id: variant.id,
    price: formatMoney(variant.price),
    compareAtPrice: formatMoneyOrNull(variant.compareAtPrice),
    availability: computeAvailability(variant.inventory),
    attributes: variant.attributes.map((attr) => ({
      attribute: attr.attributeValue.attribute,
      attributeValue: {
        id: attr.attributeValue.id,
        value: attr.attributeValue.value,
        slug: attr.attributeValue.slug,
        colorCode: attr.attributeValue.colorCode,
      },
    })),
  };
}

/**
 * Derives a deduplicated list of attribute options from the active variants.
 * Preserves insertion order (first appearance of each attribute/value).
 */
function buildAvailableOptions(
  variants: PublicProductDetailRecord['variants'],
): PublicAttributeGroup[] {
  const attributeMap = new Map<
    string,
    {
      attribute: PublicAttributeSummary;
      valueMap: Map<string, PublicAttributeValueSummary>;
    }
  >();

  for (const variant of variants) {
    for (const attr of variant.attributes) {
      const { attribute, ...rest } = attr.attributeValue;
      const attributeId = attribute.id;

      if (!attributeMap.has(attributeId)) {
        attributeMap.set(attributeId, {
          attribute,
          valueMap: new Map(),
        });
      }

      const group = attributeMap.get(attributeId);

      if (group && !group.valueMap.has(rest.id)) {
        group.valueMap.set(rest.id, {
          id: rest.id,
          value: rest.value,
          slug: rest.slug,
          colorCode: rest.colorCode,
        });
      }
    }
  }

  return [...attributeMap.values()].map((group) => ({
    attribute: group.attribute,
    values: [...group.valueMap.values()],
  }));
}

function toPublicProductDetail(record: PublicProductDetailRecord): PublicProductDetail {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    description: record.description,
    price: formatMoney(record.basePrice),
    category: record.category,
    images: record.images.map(toPublicImage),
    variants: record.variants.map(toPublicVariant),
    availableOptions: buildAvailableOptions(record.variants),
  };
}

function toPublicProductListItem(record: PublicProductListRecord): PublicProductListItem {
  const primaryImage = record.images[0];

  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    price: formatMoney(record.basePrice),
    category: record.category,
    primaryImage: primaryImage ? toPublicImage(primaryImage) : null,
  };
}

// --- Service functions ---

export async function listPublicProducts(
  input: ListPublicProductsInput,
): Promise<{ products: PublicProductListItem[]; pagination: PaginationMeta }> {
  const filters: PublicProductFilters = {
    search: input.search,
  };

  if (input.categorySlug) {
    const category = await catalogRepository.findActiveCategoryBySlug(input.categorySlug);

    if (!category) {
      throw new NotFoundError(`Category "${input.categorySlug}" not found`);
    }

    filters.categoryId = category.id;
  }

  const [records, total] = await Promise.all([
    catalogRepository.findPublicMany(filters, input.sort, input.page, input.limit),
    catalogRepository.countPublic(filters),
  ]);

  return {
    products: records.map(toPublicProductListItem),
    pagination: buildPaginationMeta(input.page, input.limit, total),
  };
}

export async function getPublicProductBySlug(slug: string): Promise<PublicProductDetail> {
  const product = await catalogRepository.findPublicBySlug(slug);

  if (!product) {
    throw new NotFoundError('Product not found');
  }

  return toPublicProductDetail(product);
}
