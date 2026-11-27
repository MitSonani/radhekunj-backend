import * as XLSX from 'xlsx';
import { Prisma, ProductStatus, ProductVariantStatus } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { generateSlug, withSlugSuffix } from '../../shared/utils/slug.js';
import { ValidationError } from '../../shared/errors/appError.js';
import { ATTRIBUTE, PRODUCT } from '../../shared/constants/index.js';

export type BulkUploadResult = {
  success: boolean;
  totalRows: number;
  productsCreated: number;
  productsUpdated: number;
  variantsCreated: number;
  variantsUpdated: number;
  errors: Array<{ row: number; identifier?: string; error: string }>;
};

type NormalizedRow = {
  rowNumber: number;
  handle: string;
  categoryName: string;
  productName: string;
  description: string | null;
  basePrice: string;
  productStatus: ProductStatus;
  sku: string;
  variantPrice: string;
  compareAtPrice: string | null;
  variantStatus: ProductVariantStatus;
  stockQuantity: number;
  lowStockThreshold: number;
  color: string | null;
  colorCode: string | null;
  size: string | null;
  imageUrls: string | null;
  primaryImageUrl: string | null;
};

type ProductGroup = {
  handle: string;
  categoryName: string;
  productName: string;
  description: string | null;
  basePrice: string;
  productStatus: ProductStatus;
  variants: NormalizedRow[];
};

const SKU_REGEX = /^[A-Za-z0-9][A-Za-z0-9\-_]*$/;
const MONEY_REGEX = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
}

function normalizeRow(raw: Record<string, unknown>, rowNumber: number): NormalizedRow {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const cleanKey = key
      .trim()
      .toLowerCase()
      .replace(/[\s\-_]+/g, '_');
    normalized[cleanKey] = typeof value === 'string' ? value.trim() : value;
  }

  const statusRaw = (
    asString(normalized['product_status']) ||
    asString(normalized['status']) ||
    'ACTIVE'
  ).toUpperCase();
  const productStatus: ProductStatus = statusRaw === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

  const variantStatusRaw = (
    asString(normalized['variant_status']) ||
    asString(normalized['status']) ||
    'ACTIVE'
  ).toUpperCase();
  const variantStatus: ProductVariantStatus =
    variantStatusRaw === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

  const basePriceRaw =
    asString(normalized['base_price']) ||
    asString(normalized['baseprice']) ||
    asString(normalized['price']);
  const variantPriceRaw =
    asString(normalized['variant_price']) || asString(normalized['price']) || basePriceRaw;
  const compareAtPriceRaw = asString(normalized['compare_at_price']) || asString(normalized['mrp']);

  const stockVal =
    normalized['stock_quantity'] ?? normalized['stock'] ?? normalized['quantity'] ?? 0;
  const stockRaw = Number(stockVal);

  const lowStockVal = normalized['low_stock_threshold'] ?? 5;
  const lowStockRaw = Number(lowStockVal);

  const colorCodeRaw = asString(normalized['color_code']) || asString(normalized['color_hex']);
  const colorCode = ATTRIBUTE.COLOR_CODE_PATTERN.test(colorCodeRaw) ? colorCodeRaw : null;

  return {
    rowNumber,
    handle:
      asString(normalized['handle']) ||
      asString(normalized['product_handle']) ||
      asString(normalized['code']),
    categoryName:
      asString(normalized['category_name']) ||
      asString(normalized['category']) ||
      asString(normalized['category_slug']),
    productName:
      asString(normalized['product_name']) ||
      asString(normalized['name']) ||
      asString(normalized['title']),
    description:
      asString(normalized['description']) ||
      asString(normalized['desc']) ||
      asString(normalized['product_description']) ||
      null,
    basePrice: basePriceRaw,
    productStatus,
    sku: asString(normalized['sku']) || asString(normalized['variant_sku']),
    variantPrice: variantPriceRaw,
    compareAtPrice: compareAtPriceRaw || null,
    variantStatus,
    stockQuantity: Number.isNaN(stockRaw) || stockRaw < 0 ? 0 : Math.floor(stockRaw),
    lowStockThreshold: Number.isNaN(lowStockRaw) || lowStockRaw < 0 ? 5 : Math.floor(lowStockRaw),
    color: asString(normalized['color']) || asString(normalized['colour']) || null,
    colorCode,
    size: asString(normalized['size']) || null,
    imageUrls:
      asString(normalized['image_urls']) ||
      asString(normalized['images']) ||
      asString(normalized['image']) ||
      null,
    primaryImageUrl:
      asString(normalized['primary_image_url']) || asString(normalized['main_image']) || null,
  };
}

async function findOrCreateCategory(name: string): Promise<string> {
  const existing = await prisma.category.findFirst({
    where: {
      OR: [{ name: { equals: name, mode: 'insensitive' } }, { slug: generateSlug(name) }],
    },
  });

  if (existing) {
    return existing.id;
  }

  const baseSlug = generateSlug(name) || 'cat';
  let slug = baseSlug;
  let counter = 1;

  while (await prisma.category.findUnique({ where: { slug } })) {
    counter += 1;
    slug = withSlugSuffix(baseSlug, counter);
  }

  const created = await prisma.category.create({
    data: {
      name,
      slug,
      status: 'ACTIVE',
    },
  });

  return created.id;
}

async function findOrCreateAttributeValue(
  attributeName: string,
  attributeSlug: string,
  value: string,
  colorCode?: string | null,
): Promise<string> {
  let attribute = await prisma.attribute.findFirst({
    where: {
      OR: [{ slug: attributeSlug }, { name: { equals: attributeName, mode: 'insensitive' } }],
    },
  });

  if (!attribute) {
    let slug = attributeSlug;
    let counter = 1;
    while (await prisma.attribute.findUnique({ where: { slug } })) {
      counter += 1;
      slug = withSlugSuffix(attributeSlug, counter);
    }

    attribute = await prisma.attribute.create({
      data: {
        name: attributeName,
        slug,
      },
    });
  }

  const valueSlug = generateSlug(value) || value.toLowerCase();
  let attrValue = await prisma.attributeValue.findFirst({
    where: {
      attributeId: attribute.id,
      OR: [{ slug: valueSlug }, { value: { equals: value, mode: 'insensitive' } }],
    },
  });

  if (!attrValue) {
    attrValue = await prisma.attributeValue.create({
      data: {
        attributeId: attribute.id,
        value,
        slug: valueSlug,
        colorCode: colorCode || null,
      },
    });
  }

  return attrValue.id;
}

async function generateUniqueProductSlug(baseSlug: string, excludeId?: string): Promise<string> {
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await prisma.product.findUnique({ where: { slug } });
    if (!existing || (excludeId && existing.id === excludeId)) {
      return slug;
    }
    counter += 1;
    slug = withSlugSuffix(baseSlug, counter);
  }
}

/**
 * Parses buffer or array into normalized rows and processes product bulk creation/updates.
 */
export async function processBulkUpload(
  bufferOrRows: Buffer | Array<Record<string, unknown>>,
): Promise<BulkUploadResult> {
  let rawRows: Array<Record<string, unknown>> = [];

  if (Buffer.isBuffer(bufferOrRows)) {
    const workbook = XLSX.read(bufferOrRows, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new ValidationError('The uploaded file contains no sheets');
    }
    const sheet = workbook.Sheets[firstSheetName];
    if (!sheet) {
      throw new ValidationError('The sheet in the uploaded file could not be read');
    }
    rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
    });
  } else if (Array.isArray(bufferOrRows)) {
    rawRows = bufferOrRows;
  } else {
    throw new ValidationError('Invalid input: expected file buffer or array of product rows');
  }

  if (rawRows.length === 0) {
    return {
      success: true,
      totalRows: 0,
      productsCreated: 0,
      productsUpdated: 0,
      variantsCreated: 0,
      variantsUpdated: 0,
      errors: [],
    };
  }

  const errors: Array<{ row: number; identifier?: string; error: string }> = [];
  const normalizedRows: NormalizedRow[] = [];

  // 1. Validation & normalization per row
  for (let i = 0; i < rawRows.length; i++) {
    const rawRow = rawRows[i];
    if (!rawRow) {
      continue;
    }
    const rowNum = i + 2; // header is row 1
    const row = normalizeRow(rawRow, rowNum);

    if (!row.sku) {
      errors.push({
        row: rowNum,
        identifier: row.handle || row.productName,
        error: 'SKU is required',
      });
      continue;
    }

    if (!SKU_REGEX.test(row.sku) || row.sku.length > PRODUCT.SKU_MAX) {
      errors.push({
        row: rowNum,
        identifier: row.sku,
        error: `Invalid SKU "${row.sku}". Must be alphanumeric with hyphens/underscores, max ${PRODUCT.SKU_MAX} chars.`,
      });
      continue;
    }

    if (!row.variantPrice || !MONEY_REGEX.test(row.variantPrice)) {
      errors.push({
        row: rowNum,
        identifier: row.sku,
        error: `Invalid variant price "${row.variantPrice}". Must be a valid positive amount.`,
      });
      continue;
    }

    if (row.compareAtPrice && !MONEY_REGEX.test(row.compareAtPrice)) {
      errors.push({
        row: rowNum,
        identifier: row.sku,
        error: `Invalid compare_at_price "${row.compareAtPrice}". Must be a valid amount.`,
      });
      continue;
    }

    normalizedRows.push(row);
  }

  // 2. Group into Products
  const productGroupsMap = new Map<string, ProductGroup>();

  for (const row of normalizedRows) {
    const key = (row.handle || row.productName || row.sku).toLowerCase();
    let group = productGroupsMap.get(key);

    if (!group) {
      group = {
        handle: row.handle || generateSlug(row.productName) || key,
        categoryName: row.categoryName || 'General',
        productName: row.productName || row.handle || row.sku,
        description: row.description,
        basePrice: row.basePrice || row.variantPrice,
        productStatus: row.productStatus,
        variants: [],
      };
      productGroupsMap.set(key, group);
    } else {
      // Inherit product details if subsequent rows have them
      if (!group.productName && row.productName) group.productName = row.productName;
      if (!group.categoryName && row.categoryName) group.categoryName = row.categoryName;
      if (!group.description && row.description) group.description = row.description;
      if (!group.basePrice && (row.basePrice || row.variantPrice))
        group.basePrice = row.basePrice || row.variantPrice;
    }

    group.variants.push(row);
  }

  let productsCreated = 0;
  let productsUpdated = 0;
  let variantsCreated = 0;
  let variantsUpdated = 0;

  // 3. Process each Product and its Variants
  for (const group of productGroupsMap.values()) {
    try {
      const categoryId = await findOrCreateCategory(group.categoryName);

      // Check if product exists by name or slug
      const productSlug = generateSlug(group.productName) || generateSlug(group.handle);
      const existingProduct = await prisma.product.findFirst({
        where: {
          OR: [{ name: { equals: group.productName, mode: 'insensitive' } }, { slug: productSlug }],
        },
      });

      let product = existingProduct;
      const basePriceDecimal = new Prisma.Decimal(
        group.basePrice || group.variants[0]?.variantPrice || '0.00',
      );

      if (!product) {
        const uniqueSlug = await generateUniqueProductSlug(productSlug || 'prod');
        product = await prisma.product.create({
          data: {
            categoryId,
            name: group.productName.slice(0, PRODUCT.NAME_MAX),
            slug: uniqueSlug,
            description: group.description,
            basePrice: basePriceDecimal,
            status: group.productStatus,
          },
        });
        productsCreated += 1;
      } else {
        product = await prisma.product.update({
          where: { id: product.id },
          data: {
            categoryId,
            description: group.description ?? product.description,
            basePrice: basePriceDecimal,
            status: group.productStatus,
          },
        });
        productsUpdated += 1;
      }

      // Process variants for this product
      for (const variantRow of group.variants) {
        try {
          const attributeValueIds: string[] = [];
          let colorAttrValueId: string | null = null;

          if (variantRow.color) {
            colorAttrValueId = await findOrCreateAttributeValue(
              'Color',
              'color',
              variantRow.color,
              variantRow.colorCode,
            );
            attributeValueIds.push(colorAttrValueId);
          }

          if (variantRow.size) {
            const sizeAttrValueId = await findOrCreateAttributeValue(
              'Size',
              'size',
              variantRow.size,
            );
            attributeValueIds.push(sizeAttrValueId);
          }

          const variantPriceDecimal = new Prisma.Decimal(variantRow.variantPrice);
          const compareAtDecimal = variantRow.compareAtPrice
            ? new Prisma.Decimal(variantRow.compareAtPrice)
            : null;

          const existingVariant = await prisma.productVariant.findFirst({
            where: { sku: { equals: variantRow.sku, mode: 'insensitive' } },
            include: { inventory: true },
          });

          let variantId: string;

          if (existingVariant) {
            const updated = await prisma.productVariant.update({
              where: { id: existingVariant.id },
              data: {
                productId: product.id,
                price: variantPriceDecimal,
                compareAtPrice: compareAtDecimal,
                status: variantRow.variantStatus,
              },
            });
            variantId = updated.id;

            await prisma.inventory.upsert({
              where: { variantId: variantId },
              update: {
                quantity: variantRow.stockQuantity,
                lowStockThreshold: variantRow.lowStockThreshold,
              },
              create: {
                variantId: variantId,
                quantity: variantRow.stockQuantity,
                lowStockThreshold: variantRow.lowStockThreshold,
              },
            });

            variantsUpdated += 1;
          } else {
            const created = await prisma.productVariant.create({
              data: {
                productId: product.id,
                sku: variantRow.sku,
                price: variantPriceDecimal,
                compareAtPrice: compareAtDecimal,
                status: variantRow.variantStatus,
                inventory: {
                  create: {
                    quantity: variantRow.stockQuantity,
                    lowStockThreshold: variantRow.lowStockThreshold,
                  },
                },
              },
            });
            variantId = created.id;
            variantsCreated += 1;
          }

          // Link attributes
          for (const attrValId of attributeValueIds) {
            await prisma.productVariantAttribute.upsert({
              where: {
                variantId_attributeValueId: {
                  variantId,
                  attributeValueId: attrValId,
                },
              },
              update: {},
              create: {
                variantId,
                attributeValueId: attrValId,
              },
            });
          }

          // Handle Images
          const imagesToAttach: Array<{ url: string; isPrimary: boolean }> = [];
          if (variantRow.primaryImageUrl) {
            imagesToAttach.push({ url: variantRow.primaryImageUrl, isPrimary: true });
          }
          if (variantRow.imageUrls) {
            const splitUrls = variantRow.imageUrls
              .split(/[,|]/)
              .map((u) => u.trim())
              .filter(Boolean);
            for (const u of splitUrls) {
              if (!imagesToAttach.some((img) => img.url === u)) {
                imagesToAttach.push({ url: u, isPrimary: imagesToAttach.length === 0 });
              }
            }
          }

          for (let idx = 0; idx < imagesToAttach.length; idx++) {
            const img = imagesToAttach[idx];
            if (!img) continue;
            const existingImg = await prisma.productImage.findFirst({
              where: { productId: product.id, objectKey: img.url },
            });

            if (!existingImg) {
              await prisma.productImage.create({
                data: {
                  productId: product.id,
                  objectKey: img.url.slice(0, 512),
                  sortOrder: idx,
                  isPrimary: img.isPrimary,
                  altText: `${product.name} image`,
                  attributeValueId: colorAttrValueId,
                },
              });
            }
          }
        } catch (variantErr: unknown) {
          const errMessage =
            variantErr instanceof Error ? variantErr.message : 'Failed to process variant';
          errors.push({
            row: variantRow.rowNumber,
            identifier: variantRow.sku,
            error: errMessage,
          });
        }
      }
    } catch (productErr: unknown) {
      const errMessage =
        productErr instanceof Error ? productErr.message : 'Failed to process product group';
      errors.push({
        row: group.variants[0]?.rowNumber || 0,
        identifier: group.productName,
        error: errMessage,
      });
    }
  }

  return {
    success: errors.length === 0,
    totalRows: rawRows.length,
    productsCreated,
    productsUpdated,
    variantsCreated,
    variantsUpdated,
    errors,
  };
}

/**
 * Returns a downloadable CSV template string.
 */
export function getBulkUploadTemplateCsv(): string {
  return [
    'handle,category_name,product_name,description,base_price,product_status,sku,variant_price,compare_at_price,variant_status,stock_quantity,low_stock_threshold,color,color_code,size,image_urls,primary_image_url',
    'cc-crewneck-tee,Essentials,Supima Classic Crewneck Tee,"Crafted from 100% American Supima cotton with extra-long staple fibers.",1299.00,ACTIVE,CC-CREW-IVR-S,1299.00,1599.00,ACTIVE,25,5,Ivory White,#F5F5F0,S,https://images.unsplash.com/photo-1521572267360-ee0c2909d518,https://images.unsplash.com/photo-1521572267360-ee0c2909d518',
    'cc-crewneck-tee,Essentials,Supima Classic Crewneck Tee,"Crafted from 100% American Supima cotton with extra-long staple fibers.",1299.00,ACTIVE,CC-CREW-IVR-M,1299.00,1599.00,ACTIVE,35,5,Ivory White,#F5F5F0,M,,',
    'cc-crewneck-tee,Essentials,Supima Classic Crewneck Tee,"Crafted from 100% American Supima cotton with extra-long staple fibers.",1299.00,ACTIVE,CC-CREW-BLK-S,1299.00,1599.00,ACTIVE,20,5,Black,#1A1A1A,S,https://images.unsplash.com/photo-1503342217505-b0a15ec3261c,',
    'cc-camp-shirt,Men,Relaxed Camp Collar Linen-Cotton Shirt,"Lightweight cotton-linen blend tailored with a retro cuban camp collar.",2499.00,ACTIVE,CC-CAMP-NVY-M,2499.00,2999.00,ACTIVE,20,5,Navy Blue,#1E293B,M,https://images.unsplash.com/photo-1596755094514-f87e34085b2c,https://images.unsplash.com/photo-1596755094514-f87e34085b2c',
    'cc-camp-shirt,Men,Relaxed Camp Collar Linen-Cotton Shirt,"Lightweight cotton-linen blend tailored with a retro cuban camp collar.",2499.00,ACTIVE,CC-CAMP-NVY-L,2499.00,2999.00,ACTIVE,25,5,Navy Blue,#1E293B,L,,',
  ].join('\n');
}
