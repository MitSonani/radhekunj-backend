/*
  Warnings:

  - You are about to drop the column `email` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[mobile_number]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Made the column `mobile_number` on table `users` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "email",
ALTER COLUMN "mobile_number" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_mobile_number_key" ON "users"("mobile_number");
