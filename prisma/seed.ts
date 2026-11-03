/**
 * Development database seed for Cotton Clique.
 *
 * Safety guards:
 *   - Refuses to run when NODE_ENV=production.
 *   - Refuses to run when DATABASE_URL contains "prod" or "test".
 *   - NEVER deletes customer user accounts or existing customer orders.
 *
 * Behaviour:
 *   - Clears development catalog data (products, categories, attributes, coupons, banners).
 *   - Preserves all customer accounts (e.g. user 'mit').
 *   - Upserts the dedicated development administrator account.
 *   - Seeds realistic Cotton Clique catalog: 4 categories, 2 attributes, 10 products with variants,
 *     inventory stock, images, 3 test coupons, hero banners, and store settings.
 *   - Running `npm run db:seed` is fully deterministic and safe.
 */

import 'dotenv/config';
import { PrismaClient, Prisma, CouponDiscountType, CouponScope, CouponStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { generateSlug } from '../src/shared/utils/slug.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type ColorKey =
  | 'black'
  | 'ivory-white'
  | 'olive-green'
  | 'navy-blue'
  | 'crimson-red'
  | 'heather-grey'
  | 'terracotta-brown'
  | 'dusty-rose'
  | 'natural-beige';

type SizeKey = 'xs' | 's' | 'm' | 'l' | 'xl' | 'xxl';

type AttributeValueDef = { value: string; slug: string; colorCode?: string };
type AttributeDef = { name: string; slug: string; values: AttributeValueDef[] };

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

// ─── Roles & Dedicated Admin User ─────────────────────────────────────────────

const ADMIN_USER = {
  name: 'Cotton Clique Admin',
  mobileNumber: '9000000001',
  countryCode: '+91',
  roleName: 'admin',
};

// ─── Categories ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  {
    name: 'Men',
    slug: 'men',
    description: 'Tailored menswear crafted from breathable organic cottons and pure linens',
    imageUrl: 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?q=80&w=800&auto=format&fit=crop',
  },
  {
    name: 'Women',
    slug: 'women',
    description: 'Effortless womenswear, flowing dresses, and conscious everyday silhouettes',
    imageUrl: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=800&auto=format&fit=crop',
  },
  {
    name: 'Essentials',
    slug: 'essentials',
    description: 'Core wardrobe staples woven from premium long-staple cotton',
    imageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=800&auto=format&fit=crop',
  },
  {
    name: 'Accessories',
    slug: 'accessories',
    description: 'Handcrafted canvas totes, pure cotton scarves, and everyday accents',
    imageUrl: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?q=80&w=800&auto=format&fit=crop',
  },
];

// ─── Attributes ───────────────────────────────────────────────────────────────

const ATTRIBUTES: AttributeDef[] = [
  {
    name: 'Size',
    slug: 'size',
    values: [
      { value: 'XS', slug: 'xs' },
      { value: 'S', slug: 's' },
      { value: 'M', slug: 'm' },
      { value: 'L', slug: 'l' },
      { value: 'XL', slug: 'xl' },
      { value: 'XXL', slug: 'xxl' },
    ],
  },
  {
    name: 'Color',
    slug: 'color',
    values: [
      { value: 'Black', slug: 'black', colorCode: '#1A1A1A' },
      { value: 'Ivory White', slug: 'ivory-white', colorCode: '#F5F5F0' },
      { value: 'Olive Green', slug: 'olive-green', colorCode: '#3D4A3E' },
      { value: 'Navy Blue', slug: 'navy-blue', colorCode: '#1E293B' },
      { value: 'Crimson Red', slug: 'crimson-red', colorCode: '#991B1B' },
      { value: 'Heather Grey', slug: 'heather-grey', colorCode: '#9CA3AF' },
      { value: 'Terracotta Brown', slug: 'terracotta-brown', colorCode: '#9A3412' },
      { value: 'Dusty Rose', slug: 'dusty-rose', colorCode: '#E0A899' },
      { value: 'Natural Beige', slug: 'natural-beige', colorCode: '#D2B48C' },
    ],
  },
];

// ─── Products (10 Realistic Cotton Clique Items) ──────────────────────────────

const PRODUCTS: ProductDef[] = [
  {
    name: 'Supima Classic Crewneck Tee',
    categorySlug: 'essentials',
    description:
      'Crafted from 100% American Supima cotton with extra-long staple fibers. Exceptionally soft, durable, and naturally breathable for year-round ease.',
    basePrice: 1299,
    status: 'ACTIVE',
    variants: [
      { sku: 'CC-CREW-IVR-S', price: 1299, compareAtPrice: 1599, status: 'ACTIVE', color: 'ivory-white', size: 's', stock: 25 },
      { sku: 'CC-CREW-IVR-M', price: 1299, compareAtPrice: 1599, status: 'ACTIVE', color: 'ivory-white', size: 'm', stock: 35 },
      { sku: 'CC-CREW-IVR-L', price: 1299, compareAtPrice: 1599, status: 'ACTIVE', color: 'ivory-white', size: 'l', stock: 30 },
      { sku: 'CC-CREW-BLK-S', price: 1299, compareAtPrice: 1599, status: 'ACTIVE', color: 'black', size: 's', stock: 20 },
      { sku: 'CC-CREW-BLK-M', price: 1299, compareAtPrice: 1599, status: 'ACTIVE', color: 'black', size: 'm', stock: 40 },
      { sku: 'CC-CREW-BLK-L', price: 1299, compareAtPrice: 1599, status: 'ACTIVE', color: 'black', size: 'l', stock: 30 },
      { sku: 'CC-CREW-OLV-M', price: 1299, compareAtPrice: 1599, status: 'ACTIVE', color: 'olive-green', size: 'm', stock: 25 },
      { sku: 'CC-CREW-OLV-L', price: 1299, compareAtPrice: 1599, status: 'ACTIVE', color: 'olive-green', size: 'l', stock: 15 },
    ],
    images: [
      { objectKey: 'products/dev/supima-tee/lifestyle.jpg', altText: 'Supima Classic Crewneck Tee lifestyle', sortOrder: 0, isPrimary: true },
      { objectKey: 'products/dev/supima-tee/ivory-front.jpg', altText: 'Supima Tee Ivory White — Front', sortOrder: 1, isPrimary: false, colorKey: 'ivory-white' },
      { objectKey: 'products/dev/supima-tee/black-front.jpg', altText: 'Supima Tee Black — Front', sortOrder: 2, isPrimary: false, colorKey: 'black' },
      { objectKey: 'products/dev/supima-tee/olive-front.jpg', altText: 'Supima Tee Olive Green — Front', sortOrder: 3, isPrimary: false, colorKey: 'olive-green' },
    ],
  },
  {
    name: 'Relaxed Camp Collar Linen-Cotton Shirt',
    categorySlug: 'men',
    description:
      'Lightweight cotton-linen blend tailored with a retro cuban camp collar and mother-of-pearl buttons. Perfect for relaxed summer afternoons and beachside evenings.',
    basePrice: 2499,
    status: 'ACTIVE',
    variants: [
      { sku: 'CC-CAMP-NVY-M', price: 2499, compareAtPrice: 2999, status: 'ACTIVE', color: 'navy-blue', size: 'm', stock: 20 },
      { sku: 'CC-CAMP-NVY-L', price: 2499, compareAtPrice: 2999, status: 'ACTIVE', color: 'navy-blue', size: 'l', stock: 25 },
      { sku: 'CC-CAMP-NVY-XL', price: 2499, compareAtPrice: 2999, status: 'ACTIVE', color: 'navy-blue', size: 'xl', stock: 15 },
      { sku: 'CC-CAMP-BEG-M', price: 2499, compareAtPrice: 2999, status: 'ACTIVE', color: 'natural-beige', size: 'm', stock: 30 },
      { sku: 'CC-CAMP-BEG-L', price: 2499, compareAtPrice: 2999, status: 'ACTIVE', color: 'natural-beige', size: 'l', stock: 20 },
    ],
    images: [
      { objectKey: 'products/dev/camp-shirt/lifestyle.jpg', altText: 'Relaxed Camp Collar Linen-Cotton Shirt lifestyle', sortOrder: 0, isPrimary: true },
      { objectKey: 'products/dev/camp-shirt/navy-front.jpg', altText: 'Camp Shirt Navy Blue — Front', sortOrder: 1, isPrimary: false, colorKey: 'navy-blue' },
      { objectKey: 'products/dev/camp-shirt/beige-front.jpg', altText: 'Camp Shirt Natural Beige — Front', sortOrder: 2, isPrimary: false, colorKey: 'natural-beige' },
    ],
  },
  {
    name: 'Artisan Pleated Cotton Trousers',
    categorySlug: 'men',
    description:
      'Single-pleat tailored trousers cut from structured twill cotton. Features side adjusters, deep slash pockets, and a timeless tapered silhouette.',
    basePrice: 3299,
    status: 'ACTIVE',
    variants: [
      { sku: 'CC-TR-BLK-S', price: 3299, compareAtPrice: 3799, status: 'ACTIVE', color: 'black', size: 's', stock: 15 },
      { sku: 'CC-TR-BLK-M', price: 3299, compareAtPrice: 3799, status: 'ACTIVE', color: 'black', size: 'm', stock: 20 },
      { sku: 'CC-TR-BLK-L', price: 3299, compareAtPrice: 3799, status: 'ACTIVE', color: 'black', size: 'l', stock: 18 },
      { sku: 'CC-TR-TER-M', price: 3299, compareAtPrice: 3799, status: 'ACTIVE', color: 'terracotta-brown', size: 'm', stock: 14 },
      { sku: 'CC-TR-TER-L', price: 3299, compareAtPrice: 3799, status: 'ACTIVE', color: 'terracotta-brown', size: 'l', stock: 12 },
    ],
    images: [
      { objectKey: 'products/dev/trousers/lifestyle.jpg', altText: 'Artisan Pleated Cotton Trousers lifestyle', sortOrder: 0, isPrimary: true },
      { objectKey: 'products/dev/trousers/black-front.jpg', altText: 'Pleated Trousers Black — Front', sortOrder: 1, isPrimary: false, colorKey: 'black' },
      { objectKey: 'products/dev/trousers/terracotta-front.jpg', altText: 'Pleated Trousers Terracotta — Front', sortOrder: 2, isPrimary: false, colorKey: 'terracotta-brown' },
    ],
  },
  {
    name: 'Organic Cotton Oxford Button-Down Shirt',
    categorySlug: 'men',
    description:
      'A heritage staple crafted from substantial pinpoint oxford cotton. Features a rolled button-down collar, box pleat with locker loop, and reinforced seams.',
    basePrice: 2799,
    status: 'ACTIVE',
    variants: [
      { sku: 'CC-OX-IVR-M', price: 2799, compareAtPrice: 3199, status: 'ACTIVE', color: 'ivory-white', size: 'm', stock: 22 },
      { sku: 'CC-OX-IVR-L', price: 2799, compareAtPrice: 3199, status: 'ACTIVE', color: 'ivory-white', size: 'l', stock: 25 },
      { sku: 'CC-OX-NVY-M', price: 2799, compareAtPrice: 3199, status: 'ACTIVE', color: 'navy-blue', size: 'm', stock: 18 },
      { sku: 'CC-OX-NVY-L', price: 2799, compareAtPrice: 3199, status: 'ACTIVE', color: 'navy-blue', size: 'l', stock: 16 },
    ],
    images: [
      { objectKey: 'products/dev/oxford-shirt/lifestyle.jpg', altText: 'Organic Cotton Oxford Button-Down Shirt lifestyle', sortOrder: 0, isPrimary: true },
      { objectKey: 'products/dev/oxford-shirt/ivory-front.jpg', altText: 'Oxford Shirt Ivory White — Front', sortOrder: 1, isPrimary: false, colorKey: 'ivory-white' },
      { objectKey: 'products/dev/oxford-shirt/navy-front.jpg', altText: 'Oxford Shirt Navy Blue — Front', sortOrder: 2, isPrimary: false, colorKey: 'navy-blue' },
    ],
  },
  {
    name: 'Handloom Cotton Tiered Midi Dress',
    categorySlug: 'women',
    description:
      'Tiered breezy silhouette handwoven from pure organic khadi cotton. Finished with subtle puffed sleeves, mother-of-pearl buttons, and dual concealed side pockets.',
    basePrice: 3499,
    status: 'ACTIVE',
    variants: [
      { sku: 'CC-DR-ROSE-S', price: 3499, compareAtPrice: 3999, status: 'ACTIVE', color: 'dusty-rose', size: 's', stock: 12 },
      { sku: 'CC-DR-ROSE-M', price: 3499, compareAtPrice: 3999, status: 'ACTIVE', color: 'dusty-rose', size: 'm', stock: 18 },
      { sku: 'CC-DR-ROSE-L', price: 3499, compareAtPrice: 3999, status: 'ACTIVE', color: 'dusty-rose', size: 'l', stock: 10 },
      { sku: 'CC-DR-IVR-S', price: 3499, compareAtPrice: 3999, status: 'ACTIVE', color: 'ivory-white', size: 's', stock: 14 },
      { sku: 'CC-DR-IVR-M', price: 3499, compareAtPrice: 3999, status: 'ACTIVE', color: 'ivory-white', size: 'm', stock: 20 },
    ],
    images: [
      { objectKey: 'products/dev/tiered-dress/lifestyle.jpg', altText: 'Handloom Cotton Tiered Midi Dress lifestyle', sortOrder: 0, isPrimary: true },
      { objectKey: 'products/dev/tiered-dress/rose-front.jpg', altText: 'Tiered Dress Dusty Rose — Front', sortOrder: 1, isPrimary: false, colorKey: 'dusty-rose' },
      { objectKey: 'products/dev/tiered-dress/ivory-front.jpg', altText: 'Tiered Dress Ivory White — Front', sortOrder: 2, isPrimary: false, colorKey: 'ivory-white' },
    ],
  },
  {
    name: 'Breezy Linen-Cotton Wrap Top',
    categorySlug: 'women',
    description:
      'Flattering kimono-style wrap top with adjustable waist ties and deep V-neckline. Breathable, softly textured, and easily styled with denim or tailored trousers.',
    basePrice: 1999,
    status: 'ACTIVE',
    variants: [
      { sku: 'CC-WP-OLV-S', price: 1999, compareAtPrice: 2399, status: 'ACTIVE', color: 'olive-green', size: 's', stock: 16 },
      { sku: 'CC-WP-OLV-M', price: 1999, compareAtPrice: 2399, status: 'ACTIVE', color: 'olive-green', size: 'm', stock: 24 },
      { sku: 'CC-WP-BEG-S', price: 1999, compareAtPrice: 2399, status: 'ACTIVE', color: 'natural-beige', size: 's', stock: 15 },
      { sku: 'CC-WP-BEG-M', price: 1999, compareAtPrice: 2399, status: 'ACTIVE', color: 'natural-beige', size: 'm', stock: 22 },
      { sku: 'CC-WP-BEG-L', price: 1999, compareAtPrice: 2399, status: 'ACTIVE', color: 'natural-beige', size: 'l', stock: 12 },
    ],
    images: [
      { objectKey: 'products/dev/wrap-top/lifestyle.jpg', altText: 'Breezy Linen-Cotton Wrap Top lifestyle', sortOrder: 0, isPrimary: true },
      { objectKey: 'products/dev/wrap-top/olive-front.jpg', altText: 'Wrap Top Olive Green — Front', sortOrder: 1, isPrimary: false, colorKey: 'olive-green' },
      { objectKey: 'products/dev/wrap-top/beige-front.jpg', altText: 'Wrap Top Natural Beige — Front', sortOrder: 2, isPrimary: false, colorKey: 'natural-beige' },
    ],
  },
  {
    name: 'Wide-Leg Pleated Cotton Culottes',
    categorySlug: 'women',
    description:
      'Modern wide-leg silhouette featuring crisp front pleats and a relaxed elasticated back waistband. Tailored from premium breathable cotton canvas.',
    basePrice: 2699,
    status: 'ACTIVE',
    variants: [
      { sku: 'CC-CUL-BLK-S', price: 2699, compareAtPrice: 3099, status: 'ACTIVE', color: 'black', size: 's', stock: 14 },
      { sku: 'CC-CUL-BLK-M', price: 2699, compareAtPrice: 3099, status: 'ACTIVE', color: 'black', size: 'm', stock: 20 },
      { sku: 'CC-CUL-TER-M', price: 2699, compareAtPrice: 3099, status: 'ACTIVE', color: 'terracotta-brown', size: 'm', stock: 18 },
      { sku: 'CC-CUL-TER-L', price: 2699, compareAtPrice: 3099, status: 'ACTIVE', color: 'terracotta-brown', size: 'l', stock: 10 },
    ],
    images: [
      { objectKey: 'products/dev/culottes/lifestyle.jpg', altText: 'Wide-Leg Pleated Cotton Culottes lifestyle', sortOrder: 0, isPrimary: true },
      { objectKey: 'products/dev/culottes/black-front.jpg', altText: 'Pleated Culottes Black — Front', sortOrder: 1, isPrimary: false, colorKey: 'black' },
      { objectKey: 'products/dev/culottes/terracotta-front.jpg', altText: 'Pleated Culottes Terracotta — Front', sortOrder: 2, isPrimary: false, colorKey: 'terracotta-brown' },
    ],
  },
  {
    name: 'Heavyweight French Terry Pullover Hoodie',
    categorySlug: 'essentials',
    description:
      'Custom-knit 450 GSM organic French terry cotton. Double-layered hood, rib-knit cuffs and hem, and a seamless kangaroo pocket built for lifelong durability.',
    basePrice: 3799,
    status: 'ACTIVE',
    variants: [
      { sku: 'CC-HD-GRY-M', price: 3799, compareAtPrice: 4299, status: 'ACTIVE', color: 'heather-grey', size: 'm', stock: 25 },
      { sku: 'CC-HD-GRY-L', price: 3799, compareAtPrice: 4299, status: 'ACTIVE', color: 'heather-grey', size: 'l', stock: 30 },
      { sku: 'CC-HD-GRY-XL', price: 3799, compareAtPrice: 4299, status: 'ACTIVE', color: 'heather-grey', size: 'xl', stock: 15 },
      { sku: 'CC-HD-BLK-M', price: 3799, compareAtPrice: 4299, status: 'ACTIVE', color: 'black', size: 'm', stock: 20 },
      { sku: 'CC-HD-BLK-L', price: 3799, compareAtPrice: 4299, status: 'ACTIVE', color: 'black', size: 'l', stock: 25 },
    ],
    images: [
      { objectKey: 'products/dev/hoodie/lifestyle.jpg', altText: 'Heavyweight French Terry Pullover Hoodie lifestyle', sortOrder: 0, isPrimary: true },
      { objectKey: 'products/dev/hoodie/grey-front.jpg', altText: 'Pullover Hoodie Heather Grey — Front', sortOrder: 1, isPrimary: false, colorKey: 'heather-grey' },
      { objectKey: 'products/dev/hoodie/black-front.jpg', altText: 'Pullover Hoodie Black — Front', sortOrder: 2, isPrimary: false, colorKey: 'black' },
    ],
  },
  {
    name: 'Heavy Canvas Daily Tote Bag',
    categorySlug: 'accessories',
    description:
      'Durable 16oz duck canvas tote featuring reinforced cross-stitch webbing handles, interior zip utility pocket, and brass key clip. Engineered for daily commuting.',
    basePrice: 1199,
    status: 'ACTIVE',
    variants: [
      { sku: 'CC-TOTE-BEG-OS', price: 1199, compareAtPrice: 1499, status: 'ACTIVE', color: 'natural-beige', size: 'm', stock: 40 },
      { sku: 'CC-TOTE-OLV-OS', price: 1199, compareAtPrice: 1499, status: 'ACTIVE', color: 'olive-green', size: 'm', stock: 35 },
      { sku: 'CC-TOTE-BLK-OS', price: 1199, compareAtPrice: 1499, status: 'ACTIVE', color: 'black', size: 'm', stock: 30 },
    ],
    images: [
      { objectKey: 'products/dev/tote-bag/lifestyle.jpg', altText: 'Heavy Canvas Daily Tote Bag lifestyle', sortOrder: 0, isPrimary: true },
      { objectKey: 'products/dev/tote-bag/beige-front.jpg', altText: 'Canvas Tote Natural Beige — Front', sortOrder: 1, isPrimary: false, colorKey: 'natural-beige' },
      { objectKey: 'products/dev/tote-bag/olive-front.jpg', altText: 'Canvas Tote Olive Green — Front', sortOrder: 2, isPrimary: false, colorKey: 'olive-green' },
    ],
  },
  {
    name: 'Artisan Hand-Dyed Cotton Scarf',
    categorySlug: 'accessories',
    description:
      'Featherweight mulmul cotton scarf hand-dyed with natural indigo and madder extracts. Soft fringe edges and rich artisanal depth.',
    basePrice: 899,
    status: 'ACTIVE',
    variants: [
      { sku: 'CC-SCF-NVY-OS', price: 899, compareAtPrice: 1199, status: 'ACTIVE', color: 'navy-blue', size: 'm', stock: 25 },
      { sku: 'CC-SCF-RED-OS', price: 899, compareAtPrice: 1199, status: 'ACTIVE', color: 'crimson-red', size: 'm', stock: 20 },
    ],
    images: [
      { objectKey: 'products/dev/scarf/lifestyle.jpg', altText: 'Artisan Hand-Dyed Cotton Scarf lifestyle', sortOrder: 0, isPrimary: true },
      { objectKey: 'products/dev/scarf/navy-front.jpg', altText: 'Cotton Scarf Navy Blue — Front', sortOrder: 1, isPrimary: false, colorKey: 'navy-blue' },
      { objectKey: 'products/dev/scarf/red-front.jpg', altText: 'Cotton Scarf Crimson Red — Front', sortOrder: 2, isPrimary: false, colorKey: 'crimson-red' },
    ],
  },
];

// ─── Coupons ──────────────────────────────────────────────────────────────────

const COUPONS = [
  {
    code: 'CLIQUE10',
    discountType: CouponDiscountType.PERCENTAGE,
    discountValue: 10,
    scope: CouponScope.CART,
    minimumCartValue: 500,
    maximumDiscount: 1000,
  },
  {
    code: 'COTTON20',
    discountType: CouponDiscountType.PERCENTAGE,
    discountValue: 20,
    scope: CouponScope.CATEGORY,
    categorySlug: 'essentials',
    minimumCartValue: 1000,
    maximumDiscount: 1500,
  },
  {
    code: 'FLAT500',
    discountType: CouponDiscountType.FIXED_AMOUNT,
    discountValue: 500,
    scope: CouponScope.CART,
    minimumCartValue: 2000,
    maximumDiscount: null,
  },
];

// ─── Hero Banners ─────────────────────────────────────────────────────────────

const BANNERS = [
  {
    title: 'The Art of Pure Cotton',
    subtitle: 'Discover timeless silhouettes hand-tailored from certified organic cotton and pure linens.',
    badgeText: 'New Season 2026',
    ctaLabel: 'Explore Collection',
    ctaLink: '/products',
    desktopImageUrl: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=1600&auto=format&fit=crop',
    tabletImageUrl: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=1024&auto=format&fit=crop',
    mobileImageUrl: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=640&auto=format&fit=crop',
    altText: 'Cotton Clique Autumn Winter Collection',
    textAlignment: 'left',
    isActive: true,
    sortOrder: 0,
  },
  {
    title: 'Everyday Luxury Essentials',
    subtitle: 'Understated staples crafted for conscious, enduring living. Ethically sourced and tailored to perfection.',
    badgeText: 'Artisan Heritage Edit',
    ctaLabel: 'Shop Essentials',
    ctaLink: '/categories/essentials',
    desktopImageUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=1600&auto=format&fit=crop',
    tabletImageUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=1024&auto=format&fit=crop',
    mobileImageUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=640&auto=format&fit=crop',
    altText: 'Cotton Clique Heritage Essentials',
    textAlignment: 'left',
    isActive: true,
    sortOrder: 1,
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
  throw new Error('Seed refused: NODE_ENV is "production". This script is for development only.');
}
if (dbName.includes('prod')) {
  throw new Error(`Seed refused: database "${dbName}" appears to be a production database. Aborting.`);
}
if (dbName.includes('test')) {
  throw new Error(`Seed refused: database "${dbName}" is the test database. Use the development database only.`);
}

console.log(`\nTarget database : ${dbName}`);
console.log(`NODE_ENV        : ${nodeEnv}`);
console.log(`Port            : ${new URL(connectionString).port || '5432'}\n`);

const pool = new pg.Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// ─── Clear Catalog Data Only ──────────────────────────────────────────────────

/**
 * Deletes development catalog data (products, categories, attributes, banners, coupons).
 * PRESERVES all customer accounts (users with role 'customer') and orders.
 */
async function clearCatalogData(): Promise<void> {
  console.log('Safely resetting development catalog data (preserving customer accounts & orders)...');

  await prisma.couponUsage.deleteMany();
  await prisma.couponProduct.deleteMany();
  await prisma.couponCategory.deleteMany();
  await prisma.coupon.deleteMany();

  await prisma.banner.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.wishlistItem.deleteMany();

  await prisma.inventoryMovement.deleteMany().catch(() => {});
  await prisma.refund.deleteMany().catch(() => {});
  await prisma.payment.deleteMany().catch(() => {});
  await prisma.shipment.deleteMany().catch(() => {});
  await prisma.orderItem.deleteMany().catch(() => {});
  await prisma.order.deleteMany().catch(() => {});
  await prisma.productImage.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.productVariantAttribute.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.attributeValue.deleteMany();
  await prisma.attribute.deleteMany();

  console.log('  ✓ Catalog and marketing data reset\n');
}

// ─── Seed Roles & Admin ───────────────────────────────────────────────────────

async function seedRolesAndAdmin(): Promise<{ adminRoleId: string; customerRoleId: string }> {
  console.log('Configuring roles and administrator account...');

  // Ensure 'customer' role exists
  let customerRole = await prisma.role.findUnique({ where: { name: 'customer' } });
  if (!customerRole) {
    customerRole = await prisma.role.create({ data: { name: 'customer' } });
  }

  // Ensure 'admin' role exists
  let adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
  if (!adminRole) {
    adminRole = await prisma.role.create({ data: { name: 'admin' } });
  }

  // Upsert dedicated development administrator account
  const existingAdmin = await prisma.user.findFirst({
    where: { mobileNumber: ADMIN_USER.mobileNumber },
  });

  if (existingAdmin) {
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: {
        name: ADMIN_USER.name,
        countryCode: ADMIN_USER.countryCode,
        roleId: adminRole.id,
      },
    });
    console.log(`  ✓ Administrator account updated: ${ADMIN_USER.name} (${ADMIN_USER.countryCode} ${ADMIN_USER.mobileNumber})`);
  } else {
    await prisma.user.create({
      data: {
        name: ADMIN_USER.name,
        mobileNumber: ADMIN_USER.mobileNumber,
        countryCode: ADMIN_USER.countryCode,
        roleId: adminRole.id,
      },
    });
    console.log(`  ✓ Administrator account created: ${ADMIN_USER.name} (${ADMIN_USER.countryCode} ${ADMIN_USER.mobileNumber})`);
  }

  return { adminRoleId: adminRole.id, customerRoleId: customerRole.id };
}

// ─── Seed Categories ──────────────────────────────────────────────────────────

async function seedCategories(): Promise<Map<string, string>> {
  const categoryIds = new Map<string, string>();

  for (const catDef of CATEGORIES) {
    const category = await prisma.category.create({
      data: {
        name: catDef.name,
        slug: catDef.slug,
        description: catDef.description,
        imageUrl: catDef.imageUrl,
        status: 'ACTIVE',
      },
    });
    categoryIds.set(catDef.slug, category.id);
  }

  console.log(`  ✓ ${CATEGORIES.length} categories created with image assets`);
  return categoryIds;
}

// ─── Seed Attributes ──────────────────────────────────────────────────────────

async function seedAttributes(): Promise<Map<string, string>> {
  const attrValueIds = new Map<string, string>();
  let totalValues = 0;

  for (const attrDef of ATTRIBUTES) {
    const attribute = await prisma.attribute.create({
      data: { name: attrDef.name, slug: attrDef.slug },
    });

    for (const valDef of attrDef.values) {
      const attrValue = await prisma.attributeValue.create({
        data: {
          attributeId: attribute.id,
          value: valDef.value,
          slug: valDef.slug,
          colorCode: valDef.colorCode ?? null,
        },
      });
      attrValueIds.set(`${attrDef.slug}:${valDef.slug}`, attrValue.id);
      totalValues++;
    }
  }

  console.log(`  ✓ ${ATTRIBUTES.length} attributes with ${totalValues} attribute values created`);
  return attrValueIds;
}

// ─── Seed Products ────────────────────────────────────────────────────────────

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
        basePrice: new Prisma.Decimal(productDef.basePrice),
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
          price: new Prisma.Decimal(variantDef.price),
          compareAtPrice: variantDef.compareAtPrice ? new Prisma.Decimal(variantDef.compareAtPrice) : null,
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
          lowStockThreshold: 5,
        },
      });

      if (variantDef.stock > 0) {
        await prisma.inventoryMovement.create({
          data: {
            variantId: variant.id,
            type: 'STOCK_RECEIVED',
            previousQuantity: 0,
            quantityChange: variantDef.stock,
            newQuantity: variantDef.stock,
            previousReserved: 0,
            reservedChange: 0,
            newReserved: 0,
            reason: 'Initial catalog inventory seed stock',
            referenceType: 'CATALOG_SEED',
            referenceId: variantDef.sku,
          },
        });
      }

      totalVariants++;
    }

    const imageData = productDef.images.map((img) => {
      const attributeValueId = img.colorKey
        ? (attrValueIds.get(`color:${img.colorKey}`) ?? null)
        : null;

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

  console.log(`  ✓ ${PRODUCTS.length} products created`);
  console.log(`  ✓ ${totalVariants} product variants with inventory created`);
  console.log(`  ✓ ${totalImages} product images registered`);
}

// ─── Seed Coupons ─────────────────────────────────────────────────────────────

async function seedCoupons(categoryIds: Map<string, string>): Promise<void> {
  const now = new Date();
  const startsAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  for (const coup of COUPONS) {
    const coupon = await prisma.coupon.create({
      data: {
        code: coup.code,
        discountType: coup.discountType,
        discountValue: new Prisma.Decimal(coup.discountValue),
        scope: coup.scope,
        minimumCartValue: coup.minimumCartValue ? new Prisma.Decimal(coup.minimumCartValue) : null,
        maximumDiscount: coup.maximumDiscount ? new Prisma.Decimal(coup.maximumDiscount) : null,
        status: CouponStatus.ACTIVE,
        startsAt,
        expiresAt,
      },
    });

    if (coup.scope === CouponScope.CATEGORY && coup.categorySlug) {
      const categoryId = categoryIds.get(coup.categorySlug);
      if (categoryId) {
        await prisma.couponCategory.create({
          data: {
            couponId: coupon.id,
            categoryId,
          },
        });
      }
    }
  }

  console.log(`  ✓ ${COUPONS.length} test coupons created (CLIQUE10, COTTON20, FLAT500)`);
}

// ─── Seed Banners ─────────────────────────────────────────────────────────────

async function seedBanners(): Promise<void> {
  for (const b of BANNERS) {
    await prisma.banner.create({
      data: {
        title: b.title,
        subtitle: b.subtitle,
        badgeText: b.badgeText,
        ctaLabel: b.ctaLabel,
        ctaLink: b.ctaLink,
        desktopImageUrl: b.desktopImageUrl,
        tabletImageUrl: b.tabletImageUrl,
        mobileImageUrl: b.mobileImageUrl,
        altText: b.altText,
        textAlignment: b.textAlignment,
        isActive: b.isActive,
        sortOrder: b.sortOrder,
      },
    });
  }

  console.log(`  ✓ ${BANNERS.length} hero banners created`);
}

// ─── Seed Store Settings ──────────────────────────────────────────────────────

async function seedStoreSettings(): Promise<void> {
  await prisma.storeSetting.upsert({
    where: { key: 'shipping' },
    create: {
      key: 'shipping',
      value: {
        enabled: true,
        flatRate: 0,
        freeShippingThreshold: 999,
      },
    },
    update: {
      value: {
        enabled: true,
        flatRate: 0,
        freeShippingThreshold: 999,
      },
    },
  });

  await prisma.storeSetting.upsert({
    where: { key: 'cod' },
    create: {
      key: 'cod',
      value: {
        enabled: true,
        maxOrderValue: 50000,
      },
    },
    update: {
      value: {
        enabled: true,
        maxOrderValue: 50000,
      },
    },
  });

  console.log('  ✓ Store settings configured (Shipping & COD)');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Starting Cotton Clique test environment setup...');

  await clearCatalogData();
  await seedRolesAndAdmin();
  const categoryIds = await seedCategories();
  const attrValueIds = await seedAttributes();
  await seedProducts(categoryIds, attrValueIds);
  await seedCoupons(categoryIds);
  await seedBanners();
  await seedStoreSettings();

  console.log('\n✅  Cotton Clique development manual testing environment prepared successfully.\n');
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
