import { Prisma, InventoryMovementType } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { AppError, NotFoundError, ValidationError } from '../../shared/errors/appError.js';
import type {
  InventoryDashboardData,
  InventoryListFilters,
  InventoryListItem,
  InventoryMovementListItem,
  InventorySettings,
  StockAdjustmentInput,
  StockStatus,
} from './types.js';

const INVENTORY_SETTINGS_KEY = 'inventory_settings';
const DEFAULT_LOW_STOCK_THRESHOLD = 5;

function determineStockStatus(
  quantity: number,
  reservedQuantity: number,
  lowStockThreshold: number,
): StockStatus {
  const available = quantity - reservedQuantity;
  if (available <= 0) return 'OUT_OF_STOCK';
  if (available <= lowStockThreshold) return 'LOW_STOCK';
  return 'IN_STOCK';
}

function mapVariantToInventoryListItem(variant: any): InventoryListItem {
  const inventory = variant.inventory ?? {
    id: '',
    quantity: 0,
    reservedQuantity: 0,
    lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
    createdAt: variant.createdAt,
    updatedAt: variant.updatedAt,
  };

  const quantity = inventory.quantity ?? 0;
  const reservedQuantity = inventory.reservedQuantity ?? 0;
  const lowStockThreshold = inventory.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
  const availableStock = Math.max(0, quantity - reservedQuantity);

  const primaryImage =
    variant.product?.images?.find((img: any) => img.isPrimary) ??
    variant.product?.images?.[0] ??
    null;

  const attributes = (variant.attributes ?? []).map((attr: any) => ({
    name: attr.attributeValue?.attribute?.name ?? '',
    value: attr.attributeValue?.value ?? '',
    colorCode: attr.attributeValue?.colorCode ?? null,
  }));

  return {
    id: inventory.id,
    variantId: variant.id,
    productId: variant.productId,
    productName: variant.product?.name ?? '',
    productSlug: variant.product?.slug ?? '',
    productImage: primaryImage?.imageUrl ?? null,
    category: {
      id: variant.product?.category?.id ?? '',
      name: variant.product?.category?.name ?? '',
      slug: variant.product?.category?.slug ?? '',
    },
    sku: variant.sku,
    price: variant.price?.toString() ?? '0.00',
    compareAtPrice: variant.compareAtPrice ? variant.compareAtPrice.toString() : null,
    attributes,
    quantity,
    reservedQuantity,
    availableStock,
    lowStockThreshold,
    stockStatus: determineStockStatus(quantity, reservedQuantity, lowStockThreshold),
    createdAt: inventory.createdAt ?? variant.createdAt,
    updatedAt: inventory.updatedAt ?? variant.updatedAt,
  };
}

function mapMovementRecord(m: any): InventoryMovementListItem {
  const primaryImage =
    m.variant?.product?.images?.find((img: any) => img.isPrimary) ??
    m.variant?.product?.images?.[0] ??
    null;

  const attributes = (m.variant?.attributes ?? []).map((attr: any) => ({
    name: attr.attributeValue?.attribute?.name ?? '',
    value: attr.attributeValue?.value ?? '',
    colorCode: attr.attributeValue?.colorCode ?? null,
  }));

  return {
    id: m.id,
    variantId: m.variantId,
    sku: m.variant?.sku ?? '',
    productName: m.variant?.product?.name ?? '',
    productImage: primaryImage?.imageUrl ?? null,
    attributes,
    type: m.type,
    previousQuantity: m.previousQuantity,
    quantityChange: m.quantityChange,
    newQuantity: m.newQuantity,
    previousReserved: m.previousReserved,
    reservedChange: m.reservedChange,
    newReserved: m.newReserved,
    reason: m.reason,
    referenceType: m.referenceType,
    referenceId: m.referenceId,
    admin: m.admin
      ? {
          id: m.admin.id,
          name: m.admin.name,
          mobileNumber: m.admin.mobileNumber,
        }
      : null,
    createdAt: m.createdAt,
  };
}

export async function getDashboardData(): Promise<InventoryDashboardData> {
  const [totalProducts, totalVariants] = await Promise.all([
    prisma.product.count(),
    prisma.productVariant.count(),
  ]);

  // High performance aggregates directly in SQL
  const statsRows = await prisma.$queryRaw<
    Array<{
      out_of_stock_count: bigint;
      low_stock_count: bigint;
      in_stock_count: bigint;
      total_quantity: bigint | null;
      total_reserved: bigint | null;
    }>
  >`
    SELECT
      COUNT(*) FILTER (WHERE (quantity - reserved_quantity) <= 0)::bigint AS out_of_stock_count,
      COUNT(*) FILTER (WHERE (quantity - reserved_quantity) > 0 AND (quantity - reserved_quantity) <= low_stock_threshold)::bigint AS low_stock_count,
      COUNT(*) FILTER (WHERE (quantity - reserved_quantity) > low_stock_threshold)::bigint AS in_stock_count,
      COALESCE(SUM(quantity), 0)::bigint AS total_quantity,
      COALESCE(SUM(reserved_quantity), 0)::bigint AS total_reserved
    FROM inventory
  `;

  const stats = statsRows[0] ?? {
    out_of_stock_count: BigInt(0),
    low_stock_count: BigInt(0),
    in_stock_count: BigInt(0),
    total_quantity: BigInt(0),
    total_reserved: BigInt(0),
  };

  const valuationRows = await prisma.$queryRaw<Array<{ total_valuation: Prisma.Decimal | null }>>`
    SELECT COALESCE(SUM(pv.price * inv.quantity), 0) AS total_valuation
    FROM inventory inv
    JOIN product_variants pv ON inv.variant_id = pv.id
  `;

  const totalStock = Number(stats.total_quantity ?? 0);
  const totalReservedStock = Number(stats.total_reserved ?? 0);
  const totalAvailableStock = Math.max(0, totalStock - totalReservedStock);
  const outOfStockCount = Number(stats.out_of_stock_count);
  const lowStockCount = Number(stats.low_stock_count);
  const inStockCount = Number(stats.in_stock_count);

  const rawValuation = valuationRows[0]?.total_valuation;
  const retailValue = rawValuation ? Number(rawValuation).toFixed(2) : '0.00';

  // Fetch 10 most recent movements
  const recentMovementsRecords = await prisma.inventoryMovement.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: {
      admin: { select: { id: true, name: true, mobileNumber: true } },
      variant: {
        include: {
          product: {
            include: {
              images: { take: 1, orderBy: { isPrimary: 'desc' } },
            },
          },
          attributes: {
            include: {
              attributeValue: { include: { attribute: true } },
            },
          },
        },
      },
    },
  });

  return {
    totalProducts,
    totalVariants,
    totalStock,
    totalAvailableStock,
    totalReservedStock,
    lowStockVariantsCount: lowStockCount,
    outOfStockVariantsCount: outOfStockCount,
    inventoryValuation: {
      retailValue,
      valuationMethod: 'Retail Value based on Variant Selling Price',
      currency: 'INR',
    },
    stockStatusBreakdown: {
      inStock: inStockCount,
      lowStock: lowStockCount,
      outOfStock: outOfStockCount,
    },
    recentMovements: recentMovementsRecords.map(mapMovementRecord),
  };
}

export async function findManyInventory(
  filters: InventoryListFilters,
  page: number,
  limit: number,
): Promise<{ items: InventoryListItem[]; total: number }> {
  const offset = (page - 1) * limit;

  // Build SQL where conditions dynamically
  const conditions: Prisma.Sql[] = [Prisma.sql`1=1`];

  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      Prisma.sql`(p.name ILIKE ${term} OR pv.sku ILIKE ${term} OR p.slug ILIKE ${term})`,
    );
  }

  if (filters.categoryId) {
    conditions.push(Prisma.sql`p.category_id = ${filters.categoryId}::uuid`);
  }

  if (filters.stockStatus && filters.stockStatus !== 'ALL') {
    if (filters.stockStatus === 'OUT_OF_STOCK') {
      conditions.push(Prisma.sql`(inv.quantity - inv.reserved_quantity) <= 0`);
    } else if (filters.stockStatus === 'LOW_STOCK') {
      conditions.push(
        Prisma.sql`(inv.quantity - inv.reserved_quantity) > 0 AND (inv.quantity - inv.reserved_quantity) <= inv.low_stock_threshold`,
      );
    } else if (filters.stockStatus === 'IN_STOCK') {
      conditions.push(
        Prisma.sql`(inv.quantity - inv.reserved_quantity) > inv.low_stock_threshold`,
      );
    }
  }

  const whereClause = Prisma.join(conditions, ' AND ');

  // Sorting
  const sortOrderSql = filters.sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  let orderBySql = Prisma.sql`inv.updated_at ${sortOrderSql}`;

  switch (filters.sortBy) {
    case 'name':
      orderBySql = Prisma.sql`p.name ${sortOrderSql}, pv.sku ASC`;
      break;
    case 'sku':
      orderBySql = Prisma.sql`pv.sku ${sortOrderSql}`;
      break;
    case 'stock':
      orderBySql = Prisma.sql`inv.quantity ${sortOrderSql}`;
      break;
    case 'availableStock':
      orderBySql = Prisma.sql`(inv.quantity - inv.reserved_quantity) ${sortOrderSql}`;
      break;
    case 'price':
      orderBySql = Prisma.sql`pv.price ${sortOrderSql}`;
      break;
    case 'updatedAt':
    default:
      orderBySql = Prisma.sql`inv.updated_at ${sortOrderSql}`;
      break;
  }

  // Count total matching
  const countResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM product_variants pv
    JOIN inventory inv ON inv.variant_id = pv.id
    JOIN products p ON pv.product_id = p.id
    JOIN categories c ON p.category_id = c.id
    WHERE ${whereClause}
  `;
  const total = Number(countResult[0]?.count ?? 0);

  if (total === 0) {
    return { items: [], total: 0 };
  }

  // Fetch paginated IDs
  const idRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT pv.id
    FROM product_variants pv
    JOIN inventory inv ON inv.variant_id = pv.id
    JOIN products p ON pv.product_id = p.id
    JOIN categories c ON p.category_id = c.id
    WHERE ${whereClause}
    ORDER BY ${orderBySql}
    LIMIT ${limit} OFFSET ${offset}
  `;

  const variantIds = idRows.map((r) => r.id);

  // Load complete records
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: {
      product: {
        include: {
          category: true,
          images: {
            orderBy: { isPrimary: 'desc' },
          },
        },
      },
      inventory: true,
      attributes: {
        include: {
          attributeValue: {
            include: {
              attribute: true,
            },
          },
        },
      },
    },
  });

  // Preserve exact sorted order from the SQL query
  const variantMap = new Map(variants.map((v) => [v.id, v]));
  const orderedVariants = variantIds
    .map((id) => variantMap.get(id))
    .filter((v): v is NonNullable<typeof v> => Boolean(v));

  return {
    items: orderedVariants.map(mapVariantToInventoryListItem),
    total,
  };
}

export async function findInventoryByVariantId(
  variantId: string,
): Promise<{
  item: InventoryListItem;
  movements: InventoryMovementListItem[];
}> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: {
      product: {
        include: {
          category: true,
          images: {
            orderBy: { isPrimary: 'desc' },
          },
        },
      },
      inventory: true,
      attributes: {
        include: {
          attributeValue: {
            include: {
              attribute: true,
            },
          },
        },
      },
    },
  });

  if (!variant) {
    throw new NotFoundError(`Variant with ID "${variantId}" not found`);
  }

  const movements = await prisma.inventoryMovement.findMany({
    where: { variantId },
    take: 20,
    orderBy: { createdAt: 'desc' },
    include: {
      admin: { select: { id: true, name: true, mobileNumber: true } },
      variant: {
        include: {
          product: {
            include: {
              images: { take: 1, orderBy: { isPrimary: 'desc' } },
            },
          },
          attributes: {
            include: {
              attributeValue: { include: { attribute: true } },
            },
          },
        },
      },
    },
  });

  return {
    item: mapVariantToInventoryListItem(variant),
    movements: movements.map(mapMovementRecord),
  };
}

export async function adjustStock(
  variantId: string,
  input: StockAdjustmentInput,
  adminId: string,
): Promise<{ item: InventoryListItem; movement: InventoryMovementListItem }> {
  return prisma.$transaction(async (tx) => {
    // Pessimistic row-level lock on inventory
    const lockedRows = await tx.$queryRaw<
      Array<{
        id: string;
        variant_id: string;
        quantity: number;
        reserved_quantity: number;
        low_stock_threshold: number;
      }>
    >`
      SELECT id, variant_id, quantity, reserved_quantity, low_stock_threshold
      FROM inventory
      WHERE variant_id = ${variantId}::uuid
      FOR UPDATE
    `;

    if (!lockedRows || lockedRows.length === 0) {
      throw new NotFoundError(`Inventory record not found for variant ID "${variantId}"`);
    }

    const current = lockedRows[0]!;
    const previousQuantity = current.quantity;
    const reservedQuantity = current.reserved_quantity;
    let newQuantity: number;
    let quantityChange: number;
    let movementType: InventoryMovementType;

    switch (input.action) {
      case 'ADD':
        quantityChange = input.quantity;
        newQuantity = previousQuantity + quantityChange;
        movementType = InventoryMovementType.STOCK_RECEIVED;
        break;

      case 'REMOVE':
        quantityChange = -input.quantity;
        newQuantity = previousQuantity + quantityChange;
        movementType = InventoryMovementType.MANUAL_ADJUSTMENT;
        break;

      case 'SET':
        newQuantity = input.quantity;
        quantityChange = newQuantity - previousQuantity;
        movementType = InventoryMovementType.MANUAL_ADJUSTMENT;
        break;

      case 'CORRECTION':
        newQuantity = input.quantity;
        quantityChange = newQuantity - previousQuantity;
        movementType = InventoryMovementType.STOCK_CORRECTION;
        break;

      default:
        throw new ValidationError(`Unknown stock adjustment action: ${input.action}`);
    }

    // Business rule guards:
    if (newQuantity < 0) {
      throw new ValidationError('Inventory quantity cannot be reduced below 0');
    }

    if (newQuantity < reservedQuantity) {
      throw new ValidationError(
        `Total quantity (${newQuantity}) cannot be less than currently reserved quantity (${reservedQuantity})`,
      );
    }

    // Update inventory row
    await tx.inventory.update({
      where: { variantId },
      data: {
        quantity: newQuantity,
      },
    });

    // Create audit movement
    const movement = await tx.inventoryMovement.create({
      data: {
        variantId,
        type: movementType,
        previousQuantity,
        quantityChange,
        newQuantity,
        previousReserved: reservedQuantity,
        reservedChange: 0,
        newReserved: reservedQuantity,
        reason: input.reason,
        referenceType: 'ADMIN_MANUAL',
        referenceId: adminId,
        adminId,
        metadata: input.notes ? { notes: input.notes } : undefined,
      },
      include: {
        admin: { select: { id: true, name: true, mobileNumber: true } },
        variant: {
          include: {
            product: {
              include: {
                images: { take: 1, orderBy: { isPrimary: 'desc' } },
              },
            },
            attributes: {
              include: {
                attributeValue: { include: { attribute: true } },
              },
            },
          },
        },
      },
    });

    // Re-fetch complete variant record
    const updatedVariant = await tx.productVariant.findUnique({
      where: { id: variantId },
      include: {
        product: {
          include: {
            category: true,
            images: {
              orderBy: { isPrimary: 'desc' },
            },
          },
        },
        inventory: true,
        attributes: {
          include: {
            attributeValue: {
              include: {
                attribute: true,
              },
            },
          },
        },
      },
    });

    if (!updatedVariant) {
      throw new AppError(500, 'Failed to reload variant after stock adjustment');
    }

    return {
      item: mapVariantToInventoryListItem(updatedVariant),
      movement: mapMovementRecord(movement),
    };
  });
}

export async function updateVariantThreshold(
  variantId: string,
  lowStockThreshold: number,
): Promise<InventoryListItem> {
  const existing = await prisma.inventory.findUnique({
    where: { variantId },
  });

  if (!existing) {
    throw new NotFoundError(`Inventory record not found for variant ID "${variantId}"`);
  }

  await prisma.inventory.update({
    where: { variantId },
    data: { lowStockThreshold },
  });

  const updatedVariant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: {
      product: {
        include: {
          category: true,
          images: {
            orderBy: { isPrimary: 'desc' },
          },
        },
      },
      inventory: true,
      attributes: {
        include: {
          attributeValue: {
            include: {
              attribute: true,
            },
          },
        },
      },
    },
  });

  if (!updatedVariant) {
    throw new AppError(500, 'Failed to reload variant after updating threshold');
  }

  return mapVariantToInventoryListItem(updatedVariant);
}

export async function findManyMovements(
  filters: {
    variantId?: string;
    type?: InventoryMovementType;
    search?: string;
    startDate?: Date;
    endDate?: Date;
  },
  page: number,
  limit: number,
): Promise<{ items: InventoryMovementListItem[]; total: number }> {
  const skip = (page - 1) * limit;

  const where: Prisma.InventoryMovementWhereInput = {};

  if (filters.variantId) {
    where.variantId = filters.variantId;
  }

  if (filters.type) {
    where.type = filters.type;
  }

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) where.createdAt.lte = filters.endDate;
  }

  if (filters.search) {
    const term = filters.search;
    where.OR = [
      { reason: { contains: term, mode: 'insensitive' } },
      { referenceId: { contains: term, mode: 'insensitive' } },
      { variant: { sku: { contains: term, mode: 'insensitive' } } },
      { variant: { product: { name: { contains: term, mode: 'insensitive' } } } },
    ];
  }

  const [records, total] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        admin: { select: { id: true, name: true, mobileNumber: true } },
        variant: {
          include: {
            product: {
              include: {
                images: { take: 1, orderBy: { isPrimary: 'desc' } },
              },
            },
            attributes: {
              include: {
                attributeValue: { include: { attribute: true } },
              },
            },
          },
        },
      },
    }),
    prisma.inventoryMovement.count({ where }),
  ]);

  return {
    items: records.map(mapMovementRecord),
    total,
  };
}

export async function getInventorySettings(): Promise<InventorySettings> {
  const record = await prisma.storeSetting.findUnique({
    where: { key: INVENTORY_SETTINGS_KEY },
  });

  if (!record || !record.value || typeof record.value !== 'object') {
    return { defaultLowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD };
  }

  const val = record.value as Record<string, unknown>;
  const threshold =
    typeof val['defaultLowStockThreshold'] === 'number'
      ? val['defaultLowStockThreshold']
      : DEFAULT_LOW_STOCK_THRESHOLD;

  return { defaultLowStockThreshold: threshold };
}

export async function updateInventorySettings(
  settings: InventorySettings,
): Promise<InventorySettings> {
  const record = await prisma.storeSetting.upsert({
    where: { key: INVENTORY_SETTINGS_KEY },
    create: {
      key: INVENTORY_SETTINGS_KEY,
      value: { defaultLowStockThreshold: settings.defaultLowStockThreshold },
    },
    update: {
      value: { defaultLowStockThreshold: settings.defaultLowStockThreshold },
    },
  });

  const val = record.value as Record<string, unknown>;
  return {
    defaultLowStockThreshold: Number(val['defaultLowStockThreshold'] ?? DEFAULT_LOW_STOCK_THRESHOLD),
  };
}
