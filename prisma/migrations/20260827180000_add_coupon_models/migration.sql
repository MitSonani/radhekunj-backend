-- CreateEnum
CREATE TYPE "coupon_discount_type" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "coupon_scope" AS ENUM ('CART', 'PRODUCT', 'CATEGORY');

-- CreateEnum
CREATE TYPE "coupon_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "carts" ADD COLUMN "coupon_id" UUID;

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "discount_type" "coupon_discount_type" NOT NULL,
    "discount_value" DECIMAL(12,2) NOT NULL,
    "scope" "coupon_scope" NOT NULL,
    "minimum_cart_value" DECIMAL(12,2),
    "maximum_discount" DECIMAL(12,2),
    "starts_at" TIMESTAMPTZ NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "usage_limit" INTEGER,
    "per_user_limit" INTEGER,
    "status" "coupon_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "coupons_code_uppercase_chk" CHECK ("code" = upper("code")),
    CONSTRAINT "coupons_discount_value_positive_chk" CHECK ("discount_value" > 0),
    CONSTRAINT "coupons_percentage_max_chk" CHECK ("discount_type" <> 'PERCENTAGE' OR "discount_value" <= 100),
    CONSTRAINT "coupons_minimum_cart_value_chk" CHECK ("minimum_cart_value" IS NULL OR "minimum_cart_value" >= 0),
    CONSTRAINT "coupons_maximum_discount_chk" CHECK ("maximum_discount" IS NULL OR "maximum_discount" > 0),
    CONSTRAINT "coupons_usage_limit_chk" CHECK ("usage_limit" IS NULL OR "usage_limit" > 0),
    CONSTRAINT "coupons_per_user_limit_chk" CHECK ("per_user_limit" IS NULL OR "per_user_limit" > 0),
    CONSTRAINT "coupons_validity_window_chk" CHECK ("expires_at" >= "starts_at")
);

-- CreateTable
CREATE TABLE "coupon_products" (
    "id" UUID NOT NULL,
    "coupon_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,

    CONSTRAINT "coupon_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_categories" (
    "id" UUID NOT NULL,
    "coupon_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "coupon_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_usages" (
    "id" UUID NOT NULL,
    "coupon_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "order_id" UUID,
    "discount_amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "coupon_usages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "coupon_usages_discount_amount_chk" CHECK ("discount_amount" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_status_idx" ON "coupons"("status");

-- CreateIndex
CREATE INDEX "coupons_starts_at_expires_at_idx" ON "coupons"("starts_at", "expires_at");

-- CreateIndex
CREATE INDEX "coupon_products_product_id_idx" ON "coupon_products"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_products_coupon_id_product_id_key" ON "coupon_products"("coupon_id", "product_id");

-- CreateIndex
CREATE INDEX "coupon_categories_category_id_idx" ON "coupon_categories"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_categories_coupon_id_category_id_key" ON "coupon_categories"("coupon_id", "category_id");

-- CreateIndex
CREATE INDEX "coupon_usages_coupon_id_idx" ON "coupon_usages"("coupon_id");

-- CreateIndex
CREATE INDEX "coupon_usages_user_id_idx" ON "coupon_usages"("user_id");

-- CreateIndex
CREATE INDEX "coupon_usages_coupon_id_user_id_idx" ON "coupon_usages"("coupon_id", "user_id");

-- CreateIndex
CREATE INDEX "coupon_usages_order_id_idx" ON "coupon_usages"("order_id");

-- Partial unique index: a coupon may be redeemed at most once per order.
-- Prisma cannot express WHERE order_id IS NOT NULL in @@unique.
-- Do not drop this index in later migrate-dev reviews.
CREATE UNIQUE INDEX "coupon_usages_coupon_id_order_id_key" ON "coupon_usages"("coupon_id", "order_id") WHERE "order_id" IS NOT NULL;

-- CreateIndex
CREATE INDEX "carts_coupon_id_idx" ON "carts"("coupon_id");

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_products" ADD CONSTRAINT "coupon_products_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_products" ADD CONSTRAINT "coupon_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_categories" ADD CONSTRAINT "coupon_categories_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_categories" ADD CONSTRAINT "coupon_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
