-- AlterTable
ALTER TABLE "orders" ADD COLUMN "idempotency_key" VARCHAR(128);

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");
