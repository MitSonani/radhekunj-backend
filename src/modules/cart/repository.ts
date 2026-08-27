import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';

export type DbClient = Prisma.TransactionClient | typeof prisma;

export async function runTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(fn);
}

// ---------------------------------------------------------------------------
// Select shapes
// ---------------------------------------------------------------------------

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

const cartItemVariantSelect = {
  id: true,
  sku: true,
  price: true,
  compareAtPrice: true,
  status: true,
  productId: true,
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
    select: {
      id: true,
      quantity: true,
      reservedQuantity: true,
    },
  },
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      images: {
        orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
        select: {
          id: true,
          objectKey: true,
          altText: true,
          isPrimary: true,
          attributeValueId: true,
        },
      },
    },
  },
} satisfies Prisma.ProductVariantSelect;

const cartItemSelect = {
  id: true,
  cartId: true,
  variantId: true,
  quantity: true,
  createdAt: true,
  updatedAt: true,
  variant: {
    select: cartItemVariantSelect,
  },
} satisfies Prisma.CartItemSelect;

const cartSelect = {
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
  items: {
    orderBy: { createdAt: 'asc' as const },
    select: cartItemSelect,
  },
} satisfies Prisma.CartSelect;

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type CartRecord = Prisma.CartGetPayload<{ select: typeof cartSelect }>;
export type CartItemRecord = Prisma.CartItemGetPayload<{ select: typeof cartItemSelect }>;

// ---------------------------------------------------------------------------
// Cart queries
// ---------------------------------------------------------------------------

export async function findCartByUserId(
  userId: string,
  db: DbClient = prisma,
): Promise<CartRecord | null> {
  return db.cart.findUnique({
    where: { userId },
    select: cartSelect,
  });
}

export async function findOrCreateCart(
  userId: string,
  db: DbClient = prisma,
): Promise<CartRecord> {
  return db.cart.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: cartSelect,
  });
}

// ---------------------------------------------------------------------------
// CartItem queries
// ---------------------------------------------------------------------------

export async function findCartItemById(
  cartItemId: string,
  db: DbClient = prisma,
): Promise<CartItemRecord | null> {
  return db.cartItem.findUnique({
    where: { id: cartItemId },
    select: cartItemSelect,
  });
}

export async function findCartItemByVariantId(
  cartId: string,
  variantId: string,
  db: DbClient = prisma,
): Promise<CartItemRecord | null> {
  return db.cartItem.findUnique({
    where: { cartId_variantId: { cartId, variantId } },
    select: cartItemSelect,
  });
}

export async function createCartItem(
  cartId: string,
  variantId: string,
  quantity: number,
  db: DbClient = prisma,
): Promise<CartItemRecord> {
  return db.cartItem.create({
    data: { cartId, variantId, quantity },
    select: cartItemSelect,
  });
}

export async function updateCartItemQuantity(
  cartItemId: string,
  quantity: number,
  db: DbClient = prisma,
): Promise<CartItemRecord> {
  return db.cartItem.update({
    where: { id: cartItemId },
    data: { quantity },
    select: cartItemSelect,
  });
}

export async function deleteCartItem(
  cartItemId: string,
  db: DbClient = prisma,
): Promise<void> {
  await db.cartItem.delete({ where: { id: cartItemId } });
}

export async function clearCartItems(
  cartId: string,
  db: DbClient = prisma,
): Promise<void> {
  await db.cartItem.deleteMany({ where: { cartId } });
}

// ---------------------------------------------------------------------------
// Concurrency: lock the inventory row for a given variant inside a transaction
// ---------------------------------------------------------------------------

export async function lockInventoryRow(
  variantId: string,
  db: Prisma.TransactionClient,
): Promise<void> {
  await db.$queryRaw`SELECT id FROM inventory WHERE variant_id = ${variantId}::uuid FOR UPDATE`;
}
