-- CreateEnum
CREATE TYPE "inventory_movement_type" AS ENUM ('STOCK_RECEIVED', 'MANUAL_ADJUSTMENT', 'STOCK_CORRECTION', 'ORDER_PLACED', 'ORDER_RESERVED', 'ORDER_RELEASED', 'ORDER_CANCELLED', 'REFUND_RESTOCKED');

-- AlterTable
ALTER TABLE "inventory" ADD COLUMN     "low_stock_threshold" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "type" "inventory_movement_type" NOT NULL,
    "previous_quantity" INTEGER NOT NULL,
    "quantity_change" INTEGER NOT NULL,
    "new_quantity" INTEGER NOT NULL,
    "previous_reserved" INTEGER NOT NULL DEFAULT 0,
    "reserved_change" INTEGER NOT NULL DEFAULT 0,
    "new_reserved" INTEGER NOT NULL DEFAULT 0,
    "reason" VARCHAR(255),
    "reference_type" VARCHAR(50),
    "reference_id" VARCHAR(128),
    "admin_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_movements_variant_id_idx" ON "inventory_movements"("variant_id");

-- CreateIndex
CREATE INDEX "inventory_movements_type_idx" ON "inventory_movements"("type");

-- CreateIndex
CREATE INDEX "inventory_movements_admin_id_idx" ON "inventory_movements"("admin_id");

-- CreateIndex
CREATE INDEX "inventory_movements_reference_type_reference_id_idx" ON "inventory_movements"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "inventory_movements_created_at_idx" ON "inventory_movements"("created_at");

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
