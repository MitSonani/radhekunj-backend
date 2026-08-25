/**
 * Development database seed.
 *
 * Safety guards:
 *   - Refuses to run when NODE_ENV=production.
 *   - Refuses to run when DATABASE_URL contains "prod" or "test".
 *
 * Behaviour:
 *   - Clears all application row data (leaves schema & _prisma_migrations intact).
 *   - Creates representative catalog data for every applicable table.
 *   - Running `npm run db:seed` twice produces the same deterministic result.
 *
 * Dependency order for deletion (reverse FK graph):
 *   product_images → inventory → product_variant_attributes →
 *   product_variants → products → categories →
 *   attribute_values → attributes → users → roles
 *
 * Seeding order (FK dependency graph):
 *   roles → users → categories → attributes → attribute_values →
 *   products → product_variants → product_variant_attributes →
 *   inventory → product_images
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { generateSlug } from '../src/shared/utils/slug.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type ColorKey = 'black' | 'white' | 'green' | 'blue' | 'red' | 'grey' | 'brown' | 'pink';
type SizeKey = 's' | 'm' | 'l' | 'xl' | 'xxl';

type AttributeValueDef = { value: string; colorCode?: string };
type AttributeDef = { name: string; values: AttributeValueDef[] };

type VariantDef = {
  sku: string;
  price: number;
  compareAtPrice?: number;
  status: 'ACTIVE' | 'INACTIVE';
  color: ColorKey;
  size: SizeKey;
  stock: number;
};

type ImageDef = {
  objectKey: string;
  altText: string;
  sortOrder: number;
  isPrimary: boolean;
  colorKey?: ColorKey;
};

type ProductDef = {
  name: string;
  categorySlug: string;
  description: string;
  basePrice: number;
  status: 'ACTIVE' | 'INACTIVE';
  variants: VariantDef[];
  images: ImageDef[];
};

// ─── Static seed data ─────────────────────────────────────────────────────────

const ROLES = ['ADMIN', 'CUSTOMER'] as const;
type RoleName = (typeof ROLES)[number];

const USERS: Array<{
  name: string;
  mobileNumber: string;
  countryCode: string;
  roleName: RoleName;
}> = [
  { name: 'Admin User', mobileNumber: '+919000000001', countryCode: '+91', roleName: 'ADMIN' },
  { name: 'Priya Sharma', mobileNumber: '+919800000001', countryCode: '+91', roleName: 'CUSTOMER' },
  { name: 'Rahul Verma', mobileNumber: '+919800000002', countryCode: '+91', roleName: 'CUSTOMER' },
  { name: 'Sneha Kapoor', mobileNumber: '+919800000003', countryCode: '+91', roleName: 'CUSTOMER' },
];

const CATEGORIES: Array<{ name: string; description: string }> = [
  { name: 'Men', description: 'Clothing and accessories for men' },
  { name: 'Women', description: 'Clothing and accessories for women' },
  { name: 'Accessories', description: 'Bags, belts, and accessories' },
  { name: 'New Arrivals', description: 'Latest additions to the catalog' },
];

const ATTRIBUTES: AttributeDef[] = [
  {
    name: 'Size',
    values: [
      { value: 'S' },
      { value: 'M' },
      { value: 'L' },
      { value: 'XL' },
      { value: 'XXL' },
    ],
  },
  {
    name: 'Color',
    values: [
      { value: 'Black', colorCode: '#000000' },
      { value: 'White', colorCode: '#FFFFFF' },
      { value: 'Green', colorCode: '#164A35' },
      { value: 'Blue', colorCode: '#1E3A8A' },
      { value: 'Red', colorCode: '#B91C1C' },
      { value: 'Grey', colorCode: '#6B7280' },
      { value: 'Brown', colorCode: '#78350F' },
      { value: 'Pink', colorCode: '#F472B6' },
    ],
  },
];

const PRODUCTS: ProductDef[] = [
  {
    name: 'Premium Cotton T-Shirt',
    categorySlug: 'men',
    description:
      'A wardrobe essential crafted from 100% premium ring-spun cotton. Lightweight, breathable, and designed for an effortless everyday fit.',
    basePrice: 1499,
    status: 'ACTIVE',
    variants: [
      { sku: 'AURA-TS-BLK-S', price: 1499, status: 'ACTIVE', color: 'black', size: 's', stock: 15 },
      { sku: 'AURA-TS-BLK-M', price: 1499, status: 'ACTIVE', color: 'black', size: 'm', stock: 25 },
      { sku: 'AURA-TS-BLK-L', price: 1499, status: 'ACTIVE', color: 'black', size: 'l', stock: 20 },
      { sku: 'AURA-TS-BLK-XL', price: 1499, status: 'ACTIVE', color: 'black', size: 'xl', stock: 10 },
      { sku: 'AURA-TS-WHT-S', price: 1499, status: 'ACTIVE', color: 'white', size: 's', stock: 12 },
      { sku: 'AURA-TS-WHT-M', price: 1499, status: 'ACTIVE', color: 'white', size: 'm', stock: 20 },
      { sku: 'AURA-TS-WHT-L', price: 1499, status: 'ACTIVE', color: 'white', size: 'l', stock: 0 },
    ],
    images: [
      { objectKey: 'products/dev/tshirt/lifestyle.jpg', altText: 'Premium Cotton T-Shirt lifestyle shot', sortOrder: 0, isPrimary: true },
      { objectKey: 'products/dev/tshirt/black-front.jpg', altText: 'Premium Cotton T-Shirt Black — Front', sortOrder: 1, isPrimary: false, colorKey: 'black' },
      { objectKey: 'products/dev/tshirt/black-back.jpg', altText: 'Premium Cotton T-Shirt Black — Back', sortOrder: 2, isPrimary: false, colorKey: 'black' },
      { objectKey: 'products/dev/tshirt/white-front.jpg', altText: 'Premium Cotton T-Shirt White — Front', sortOrder: 3, isPrimary: false, colorKey: 'white' },
      { objectKey: 'products/dev/tshirt/white-back.jpg', altText: 'Premium Cotton T-Shirt White — Back', sortOrder: 4, isPrimary: false, colorKey: 'white' },
    ],
  },
  {
    name: 'Oversized Relaxed Shirt',
    categorySlug: 'men',
    description:
      'Dropped shoulders, a boxy silhouette, and breathable fabric — this shirt is built for comfort without sacrificing style.',
    basePrice: 1999,
    status: 'ACTIVE',
    variants: [
      { sku: 'AURA-ORS-GRN-M', price: 1999, status: 'ACTIVE', color: 'green', size: 'm', stock: 18 },
      { sku: 'AURA-ORS-GRN-L', price: 1999, status: 'ACTIVE', color: 'green', size: 'l', stock: 14 },
      { sku: 'AURA-ORS-BLU-M', price: 1999, status: 'ACTIVE', color: 'blue', size: 'm', stock: 20 },
      { sku: 'AURA-ORS-BLU-L', price: 1999, status: 'ACTIVE', color: 'blue', size: 'l', stock: 16 },
      { sku: 'AURA-ORS-BLU-XL', price: 1999, status: 'ACTIVE', color: 'blue', size: 'xl', stock: 8 },
    ],
    images: [
      { objectKey: 'products/dev/oversized-shirt/lifestyle.jpg', altText: 'Oversized Relaxed Shirt lifestyle shot', sortOrder: 0, isPrimary: true },
      { objectKey: 'products/dev/oversized-shirt/green-front.jpg', altText: 'Oversized Relaxed Shirt Green — Front', sortOrder: 1, isPrimary: false, colorKey: 'green' },
      { objectKey: 'products/dev/oversized-shirt/green-back.jpg', altText: 'Oversized Relaxed Shirt Green — Back', sortOrder: 2, isPrimary: false, colorKey: 'green' },
      { objectKey: 'products/dev/oversized-shirt/blue-front.jpg', altText: 'Oversized Relaxed Shirt Blue — Front', sortOrder: 3, isPrimary: false, colorKey: 'blue' },
      { objectKey: 'products/dev/oversized-shirt/blue-back.jpg', altText: 'Oversized Relaxed Shirt Blue — Back', sortOrder: 4, isPrimary: false, colorKey: 'blue' },
    ],
  },
  {
    name: 'Classic Linen Shirt',
    categorySlug: 'men',
    description:
      'Woven from pure linen, this relaxed-fit shirt keeps you cool and polished through the warmest days.',
    basePrice: 2499,
    status: 'ACTIVE',
    variants: [
      { sku: 'AURA-LS-WHT-S', price: 2499, status: 'ACTIVE', color: 'white', size: 's', stock: 10 },
      { sku: 'AURA-LS-WHT-M', price: 2499, status: 'ACTIVE', color: 'white', size: 'm', stock: 15 },
      { sku: 'AURA-LS-WHT-L', price: 2499, status: 'ACTIVE', color: 'white', size: 'l', stock: 12 },
      { sku: 'AURA-LS-WHT-XL', price: 2499, status: 'ACTIVE', color: 'white', size: 'xl', stock: 6 },
      { sku: 'AURA-LS-BLU-M', price: 2499, status: 'ACTIVE', color: 'blue', size: 'm', stock: 20 },
      { sku: 'AURA-LS-BLU-L', price: 2499, status: 'ACTIVE', color: 'blue', size: 'l', stock: 14 },
    ],
    images: [
      { objectKey: 'products/dev/linen-shirt/lifestyle.jpg', altText: 'Classic Linen Shirt lifestyle shot', sortOrder: 0, isPrimary: true },
      { objectKey: 'products/dev/linen-shirt/white-front.jpg', altText: 'Classic Linen Shirt White — Front', sortOrder: 1, isPrimary: false, colorKey: 'white' },
      { objectKey: 'products/dev/linen-shirt/white-back.jpg', altText: 'Classic Linen Shirt White — Back', sortOrder: 2, isPrimary: false, colorKey: 'white' },
      { objectKey: 'products/dev/linen-shirt/blue-front.jpg', altText: 'Classic Linen Shirt Blue — Front', sortOrder: 3, isPrimary: false, colorKey: 'blue' },
      { objectKey: 'products/dev/linen-shirt/blue-back.jpg', altText: 'Classic Linen Shirt Blue — Back', sortOrder: 4, isPrimary: false, colorKey: 'blue' },
    ],
  },
  {
    name: 'Everyday Hoodie',
    categorySlug: 'men',
    description:
      'A mid-weight fleece hoodie perfect for layering. Kangaroo pocket, adjustable drawstring, and a relaxed fit that goes with everything.',
    basePrice: 2999,
    status: 'ACTIVE',
    variants: [
      { sku: 'AURA-HD-BLK-S', price: 2999, compareAtPrice: 3499, status: 'ACTIVE', color: 'black', size: 's', stock: 20 },
      { sku: 'AURA-HD-BLK-M', price: 2999, compareAtPrice: 3499, status: 'ACTIVE', color: 'black', size: 'm', stock: 30 },
      { sku: 'AURA-HD-BLK-L', price: 2999, compareAtPrice: 3499, status: 'ACTIVE', color: 'black', size: 'l', stock: 25 },
      { sku: 'AURA-HD-GRY-M', price: 2999, compareAtPrice: 3499, status: 'ACTIVE', color: 'grey', size: 'm', stock: 22 },
      { sku: 'AURA-HD-GRY-L', price: 2999, compareAtPrice: 3499, status: 'ACTIVE', color: 'grey', size: 'l', stock: 0 },
    ],
    images: [
      { objectKey: 'products/dev/hoodie/lifestyle.jpg', altText: 'Everyday Hoodie lifestyle shot', sortOrder: 0, isPrimary: true },
      { objectKey: 'products/dev/hoodie/black-front.jpg', altText: 'Everyday Hoodie Black — Front', sortOrder: 1, isPrimary: false, colorKey: 'black' },
      { objectKey: 'products/dev/hoodie/black-back.jpg', altText: 'Everyday Hoodie Black — Back', sortOrder: 2, isPrimary: false, colorKey: 'black' },
      { objectKey: 'products/dev/hoodie/grey-front.jpg', altText: 'Everyday Hoodie Grey — Front', sortOrder: 3, isPrimary: false, colorKey: 'grey' },
      { objectKey: 'products/dev/hoodie/grey-back.jpg', altText: 'Everyday Hoodie Grey — Back', sortOrder: 4, isPrimary: false, colorKey: 'grey' },
    ],
  },
  {
    name: 'Straight Fit Trousers',
    categorySlug: 'men',
    description:
      'Clean lines, a straight leg, and a comfortable mid-rise. These versatile trousers transition effortlessly from casual to smart-casual.',
    basePrice: 3499,
    status: 'ACTIVE',
    variants: [
      { sku: 'AURA-TRS-BLK-S', price: 3499, status: 'ACTIVE', color: 'black', size: 's', stock: 8 },
      { sku: 'AURA-TRS-BLK-M', price: 3499, status: 'ACTIVE', color: 'black', size: 'm', stock: 14 },
      { sku: 'AURA-TRS-BLK-L', price: 3499, status: 'ACTIVE', color: 'black', size: 'l', stock: 10 },
      { sku: 'AURA-TRS-BRN-M', price: 3499, status: 'ACTIVE', color: 'brown', size: 'm', stock: 12 },
      { sku: 'AURA-TRS-BRN-L', price: 3499, status: 'ACTIVE', color: 'brown', size: 'l', stock: 6 },
    ],
    images: [
      { objectKey: 'products/dev/trousers/lifestyle.jpg', altText: 'Straight Fit Trousers lifestyle shot', sortOrder: 0, isPrimary: true },
      { objectKey: 'products/dev/trousers/black-front.jpg', altText: 'Straight Fit Trousers Black — Front', sortOrder: 1, isPrimary: false, colorKey: 'black' },
      { objectKey: 'products/dev/trousers/black-back.jpg', altText: 'Straight Fit Trousers Black — Back', sortOrder: 2, isPrimary: false, colorKey: 'black' },
      { objectKey: 'products/dev/trousers/brown-front.jpg', altText: 'Straight Fit Trousers Brown — Front', sortOrder: 3, isPrimary: false, colorKey: 'brown' },
      { objectKey: 'products/dev/trousers/brown-back.jpg', altText: 'Straight Fit Trousers Brown — Back', sortOrder: 4, isPrimary: false, colorKey: 'brown' },
    ],
  },
  {
    name: 'Floral Wrap Dress',
    categorySlug: 'women',
    description:
      'A flowing wrap silhouette with a delicate print. Adjustable tie waist and midi length make it suitable for any occasion.',
    basePrice: 2299,
    status: 'ACTIVE',
    variants: [
      { sku: 'AURA-WD-GRN-S', price: 2299, status: 'ACTIVE', color: 'green', size: 's', stock: 16 },
      { sku: 'AURA-WD-GRN-M', price: 2299, status: 'ACTIVE', color: 'green', size: 'm', stock: 20 },
      { sku: 'AURA-WD-GRN-L', price: 2299, status: 'ACTIVE', color: 'green', size: 'l', stock: 12 },
      { sku: 'AURA-WD-PNK-M', price: 2299, status: 'ACTIVE', color: 'pink', size: 'm', stock: 18 },
      { sku: 'AURA-WD-PNK-L', price: 2299, status: 'ACTIVE', color: 'pink', size: 'l', stock: 10 },
    ],
    images: [
      { objectKey: 'products/dev/wrap-dress/lifestyle.jpg', altText: 'Floral Wrap Dress lifestyle shot', sortOrder: 0, isPrimary: true },
      { objectKey: 'products/dev/wrap-dress/green-front.jpg', altText: 'Floral Wrap Dress Green — Front', sortOrder: 1, isPrimary: false, colorKey: 'green' },
      { objectKey: 'products/dev/wrap-dress/green-back.jpg', altText: 'Floral Wrap Dress Green — Back', sortOrder: 2, isPrimary: false, colorKey: 'green' },
      { objectKey: 'products/dev/wrap-dress/pink-front.jpg', altText: 'Floral Wrap Dress Pink — Front', sortOrder: 3, isPrimary: false, colorKey: 'pink' },
      { objectKey: 'products/dev/wrap-dress/pink-back.jpg', altText: 'Floral Wrap Dress Pink — Back', sortOrder: 4, isPrimary: false, colorKey: 'pink' },
    ],
  },
  {
    name: 'Cropped Denim Jacket',
    categorySlug: 'women',
    description:
      'A classic denim jacket reimagined with a cropped, tailored silhouette. A timeless layering piece for year-round styling.',
    basePrice: 3999,
    status: 'INACTIVE',
    variants: [
      { sku: 'AURA-DJ-BLU-S', price: 3999, status: 'INACTIVE', color: 'blue', size: 's', stock: 0 },
      { sku: 'AURA-DJ-BLU-M', price: 3999, status: 'INACTIVE', color: 'blue', size: 'm', stock: 0 },
      { sku: 'AURA-DJ-BLU-L', price: 3999, status: 'INACTIVE', color: 'blue', size: 'l', stock: 0 },
      { sku: 'AURA-DJ-BLU-XL', price: 3999, status: 'INACTIVE', color: 'blue', size: 'xl', stock: 0 },
    ],
    images: [
      { objectKey: 'products/dev/denim-jacket/lifestyle.jpg', altText: 'Cropped Denim Jacket lifestyle shot', sortOrder: 0, isPrimary: true },
      { objectKey: 'products/dev/denim-jacket/blue-front.jpg', altText: 'Cropped Denim Jacket Blue — Front', sortOrder: 1, isPrimary: false, colorKey: 'blue' },
      { objectKey: 'products/dev/denim-jacket/blue-back.jpg', altText: 'Cropped Denim Jacket Blue — Back', sortOrder: 2, isPrimary: false, colorKey: 'blue' },
    ],
  },
];

// ─── Client setup ─────────────────────────────────────────────────────────────

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed the database');
}

const dbName = new URL(connectionString).pathname.replace(/^\//, '');
const nodeEnv = process.env.NODE_ENV ?? 'development';

if (nodeEnv === 'production') {
  throw new Error(
    `Seed refused: NODE_ENV is "production". This script is for development only.`,
  );
}
if (dbName.includes('prod')) {
  throw new Error(
    `Seed refused: database "${dbName}" appears to be a production database. Aborting.`,
  );
}
if (dbName.includes('test')) {
  throw new Error(
    `Seed refused: database "${dbName}" is the test database. Use the development database only.`,
  );
}

console.log(`\nTarget database : ${dbName}`);
console.log(`NODE_ENV        : ${nodeEnv}`);
console.log(`Port            : ${new URL(connectionString).port || '5432'}\n`);

const pool = new pg.Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// ─── Clear ────────────────────────────────────────────────────────────────────

/**
 * Deletes all application row data from the development database.
 * Preserves schema tables and _prisma_migrations.
 * Deletion follows reverse FK dependency order.
 */
async function clearDevData(): Promise<void> {
  console.log('Clearing existing development data...');
  await prisma.productImage.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.productVariantAttribute.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.attributeValue.deleteMany();
  await prisma.attribute.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  console.log('  ✓ All development data cleared\n');
}

// ─── Seed functions ───────────────────────────────────────────────────────────

async function seedRoles(): Promise<Map<string, string>> {
  const roleIds = new Map<string, string>();

  for (const roleName of ROLES) {
    const role = await prisma.role.create({ data: { name: roleName } });
    roleIds.set(roleName, role.id);
  }

  console.log(`  ✓ ${ROLES.length} roles`);
  return roleIds;
}

async function seedUsers(roleIds: Map<string, string>): Promise<void> {
  for (const userDef of USERS) {
    const roleId = roleIds.get(userDef.roleName);
    if (!roleId) throw new Error(`Role not found in map: ${userDef.roleName}`);

    await prisma.user.create({
      data: {
        name: userDef.name,
        mobileNumber: userDef.mobileNumber,
        countryCode: userDef.countryCode,
        roleId,
      },
    });
  }

  console.log(`  ✓ ${USERS.length} users`);
}

async function seedCategories(): Promise<Map<string, string>> {
  const categoryIds = new Map<string, string>();

  for (const catDef of CATEGORIES) {
    const slug = generateSlug(catDef.name);
    const category = await prisma.category.create({
      data: {
        name: catDef.name,
        slug,
        description: catDef.description,
        status: 'ACTIVE',
      },
    });
    categoryIds.set(slug, category.id);
  }

  console.log(`  ✓ ${CATEGORIES.length} categories`);
  return categoryIds;
}

/**
 * Seeds attributes and their values.
 * Returns a lookup map keyed by "<attribute-slug>:<value-slug>", e.g. "color:black", "size:m".
 */
async function seedAttributes(): Promise<Map<string, string>> {
  const attrValueIds = new Map<string, string>();
  let totalValues = 0;

  for (const attrDef of ATTRIBUTES) {
    const attrSlug = generateSlug(attrDef.name);

    const attribute = await prisma.attribute.create({
      data: { name: attrDef.name, slug: attrSlug },
    });

    for (const valDef of attrDef.values) {
      const valSlug = generateSlug(valDef.value);
      const attrValue = await prisma.attributeValue.create({
        data: {
          attributeId: attribute.id,
          value: valDef.value,
          slug: valSlug,
          colorCode: valDef.colorCode ?? null,
        },
      });
      attrValueIds.set(`${attrSlug}:${valSlug}`, attrValue.id);
      totalValues++;
    }
  }

  console.log(`  ✓ ${ATTRIBUTES.length} attributes, ${totalValues} attribute values`);
  return attrValueIds;
}

async function seedProducts(
  categoryIds: Map<string, string>,
  attrValueIds: Map<string, string>,
): Promise<void> {
  let totalVariants = 0;
  let totalImages = 0;

  for (const productDef of PRODUCTS) {
    const categoryId = categoryIds.get(productDef.categorySlug);
    if (!categoryId) {
      throw new Error(`Category not found in map: ${productDef.categorySlug}`);
    }

    const product = await prisma.product.create({
      data: {
        name: productDef.name,
        slug: generateSlug(productDef.name),
        description: productDef.description,
        basePrice: productDef.basePrice,
        categoryId,
        status: productDef.status,
      },
    });

    for (const variantDef of productDef.variants) {
      const colorValueId = attrValueIds.get(`color:${variantDef.color}`);
      const sizeValueId = attrValueIds.get(`size:${variantDef.size}`);

      if (!colorValueId) {
        throw new Error(`Color attribute value not found: color:${variantDef.color}`);
      }
      if (!sizeValueId) {
        throw new Error(`Size attribute value not found: size:${variantDef.size}`);
      }

      const variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: variantDef.sku,
          price: variantDef.price,
          compareAtPrice: variantDef.compareAtPrice ?? null,
          status: variantDef.status,
        },
      });

      await prisma.productVariantAttribute.createMany({
        data: [
          { variantId: variant.id, attributeValueId: colorValueId },
          { variantId: variant.id, attributeValueId: sizeValueId },
        ],
      });

      await prisma.inventory.create({
        data: {
          variantId: variant.id,
          quantity: variantDef.stock,
          reservedQuantity: 0,
        },
      });

      totalVariants++;
    }

    const imageData = productDef.images.map((img) => {
      const attributeValueId = img.colorKey
        ? (attrValueIds.get(`color:${img.colorKey}`) ?? null)
        : null;

      if (img.colorKey && !attributeValueId) {
        throw new Error(`Color attribute value not found for image: color:${img.colorKey}`);
      }

      return {
        productId: product.id,
        attributeValueId,
        objectKey: img.objectKey,
        altText: img.altText,
        sortOrder: img.sortOrder,
        isPrimary: img.isPrimary,
      };
    });

    await prisma.productImage.createMany({ data: imageData });
    totalImages += imageData.length;
  }

  console.log(`  ✓ ${PRODUCTS.length} products`);
  console.log(`  ✓ ${totalVariants} product variants`);
  console.log(`  ✓ ${totalImages} product images`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await clearDevData();

  console.log('Seeding...');
  const roleIds = await seedRoles();
  await seedUsers(roleIds);
  const categoryIds = await seedCategories();
  const attrValueIds = await seedAttributes();
  await seedProducts(categoryIds, attrValueIds);

  console.log('\n✅  Development database seeded successfully.\n');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (error: unknown) => {
    console.error('\n❌  Seed failed:', error);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
