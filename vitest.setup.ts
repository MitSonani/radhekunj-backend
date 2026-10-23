import 'dotenv/config';
import { beforeEach } from 'vitest';

process.env.NODE_ENV = 'test';
// Force the test database — always override DATABASE_URL to prevent accidental dev/prod access.
process.env.DATABASE_URL = 'postgresql://ecommerce_user:ecomerce@localhost:5433/ecommerce_test';
process.env.CORS_ORIGIN ??= 'http://localhost:3001';
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.AWS_REGION ??= 'ap-south-1';
process.env.AWS_ACCESS_KEY_ID ??= 'test-access-key';
process.env.AWS_SECRET_ACCESS_KEY ??= 'test-secret-key';
process.env.AWS_S3_BUCKET ??= 'test-category-images';
process.env.RAZORPAY_KEY_ID ??= 'rzp_test_mock_id';
process.env.RAZORPAY_KEY_SECRET ??= 'rzp_test_mock_secret';
process.env.RAZORPAY_WEBHOOK_SECRET ??= 'rzp_webhook_secret';

import { appConfig } from './src/config/index.js';
import { prisma } from './src/database/prisma.js';

appConfig.s3.region = 'ap-south-1';
appConfig.s3.accessKeyId = 'test-access-key';
appConfig.s3.secretAccessKey = 'test-secret-key';
appConfig.s3.bucket = 'test-category-images';

beforeEach(async () => {
  await prisma.refund.deleteMany().catch(() => {});
  await prisma.storeSetting.deleteMany().catch(() => {});
  await prisma.shipment.deleteMany().catch(() => {});
  await prisma.payment.deleteMany().catch(() => {});
  await prisma.orderItem.deleteMany().catch(() => {});
  await prisma.couponUsage.deleteMany().catch(() => {});
  await prisma.order.deleteMany().catch(() => {});
  await prisma.cartItem.deleteMany().catch(() => {});
  await prisma.cart.deleteMany().catch(() => {});
  await prisma.wishlistItem.deleteMany().catch(() => {});
  await prisma.couponProduct.deleteMany().catch(() => {});
  await prisma.couponCategory.deleteMany().catch(() => {});
  await prisma.coupon.deleteMany().catch(() => {});
  await prisma.address.deleteMany().catch(() => {});
  await prisma.inventory.deleteMany().catch(() => {});
  await prisma.productVariantAttribute.deleteMany().catch(() => {});
  await prisma.productImage.deleteMany().catch(() => {});
  await prisma.productVariant.deleteMany().catch(() => {});
  await prisma.product.deleteMany().catch(() => {});
  await prisma.attributeValue.deleteMany().catch(() => {});
  await prisma.attribute.deleteMany().catch(() => {});
  await prisma.category.deleteMany().catch(() => {});
  await prisma.user.deleteMany().catch(() => {});
  await prisma.role.deleteMany().catch(() => {});
});
