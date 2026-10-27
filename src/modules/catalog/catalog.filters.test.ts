/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../database/prisma.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';

const app = createApp();

describe('Product Catalog Dynamic Filters Suite', () => {
  beforeEach(async () => {
    // Clean Database
    await prisma.refund.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.orderItem.deleteMany({});
    await prisma.couponUsage.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.cartItem.deleteMany({});
    await prisma.cart.deleteMany({});
    await prisma.inventory.deleteMany({});
    await prisma.productVariantAttribute.deleteMany({});
    await prisma.productImage.deleteMany({});
    await prisma.productVariant.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.attributeValue.deleteMany({});
    await prisma.attribute.deleteMany({});

    // 1. Attributes & Values
    const colorAttr = await prisma.attribute.create({
      data: { name: 'Color', slug: 'color' },
    });
    const redVal = await prisma.attributeValue.create({
      data: { attributeId: colorAttr.id, value: 'Red', slug: 'red', colorCode: '#FF0000' },
    });
    const blueVal = await prisma.attributeValue.create({
      data: { attributeId: colorAttr.id, value: 'Blue', slug: 'blue', colorCode: '#0000FF' },
    });

    const sizeAttr = await prisma.attribute.create({
      data: { name: 'Size', slug: 'size' },
    });
    const sizeMVal = await prisma.attributeValue.create({
      data: { attributeId: sizeAttr.id, value: 'M', slug: 'm' },
    });
    const sizeLVal = await prisma.attributeValue.create({
      data: { attributeId: sizeAttr.id, value: 'L', slug: 'l' },
    });

    // 2. Categories
    const kurtasCat = await prisma.category.create({
      data: { name: 'Kurtas', slug: 'kurtas', status: 'ACTIVE' },
    });
    const sareesCat = await prisma.category.create({
      data: { name: 'Sarees', slug: 'sarees', status: 'ACTIVE' },
    });

    // 3. Product A: Kurta Red M (Price 1000, In Stock)
    const prodA = await prisma.product.create({
      data: { name: 'Red Kurta', slug: 'red-kurta', basePrice: 1000, categoryId: kurtasCat.id, status: 'ACTIVE' },
    });
    const varA = await prisma.productVariant.create({
      data: { productId: prodA.id, sku: 'KRT-RED-M', price: 1000, status: 'ACTIVE' },
    });
    await prisma.inventory.create({ data: { variantId: varA.id, quantity: 10, reservedQuantity: 0 } });
    await prisma.productVariantAttribute.create({ data: { variantId: varA.id, attributeValueId: redVal.id } });
    await prisma.productVariantAttribute.create({ data: { variantId: varA.id, attributeValueId: sizeMVal.id } });

    // 4. Product B: Blue Saree L (Price 3000, In Stock)
    const prodB = await prisma.product.create({
      data: { name: 'Blue Silk Saree', slug: 'blue-silk-saree', basePrice: 3000, categoryId: sareesCat.id, status: 'ACTIVE' },
    });
    const varB = await prisma.productVariant.create({
      data: { productId: prodB.id, sku: 'SAR-BLU-L', price: 3000, status: 'ACTIVE' },
    });
    await prisma.inventory.create({ data: { variantId: varB.id, quantity: 5, reservedQuantity: 0 } });
    await prisma.productVariantAttribute.create({ data: { variantId: varB.id, attributeValueId: blueVal.id } });
    await prisma.productVariantAttribute.create({ data: { variantId: varB.id, attributeValueId: sizeLVal.id } });

    // 5. Product C: Expensive Kurta (Price 6000, Out of Stock)
    const prodC = await prisma.product.create({
      data: { name: 'Designer Gold Kurta', slug: 'designer-gold-kurta', basePrice: 6000, categoryId: kurtasCat.id, status: 'ACTIVE' },
    });
    const varC = await prisma.productVariant.create({
      data: { productId: prodC.id, sku: 'KRT-GLD-M', price: 6000, status: 'ACTIVE' },
    });
    await prisma.inventory.create({ data: { variantId: varC.id, quantity: 0, reservedQuantity: 0 } });
    await prisma.productVariantAttribute.create({ data: { variantId: varC.id, attributeValueId: sizeMVal.id } });
  });

  it('1. Filters products by minimum and maximum price', async () => {
    // Price between 800 and 2000 -> Should only return Red Kurta (1000)
    const res = await request(app)
      .get('/api/v1/products?minPrice=800&maxPrice=2000')
      .expect(HTTP_STATUS.OK);

    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].slug).toBe('red-kurta');
  });

  it('2. Rejects invalid price ranges where minPrice > maxPrice with 400 Bad Request', async () => {
    const res = await request(app)
      .get('/api/v1/products?minPrice=3000&maxPrice=1000');

    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    expect(res.body.success).toBe(false);
    expect(JSON.stringify(res.body)).toContain('minPrice cannot be greater than maxPrice');
  });

  it('3. Filters products by color', async () => {
    const res = await request(app)
      .get('/api/v1/products?color=red')
      .expect(HTTP_STATUS.OK);

    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].slug).toBe('red-kurta');
  });

  it('4. Filters products by size', async () => {
    const res = await request(app)
      .get('/api/v1/products?size=m')
      .expect(HTTP_STATUS.OK);

    // Both Red Kurta (M) and Designer Gold Kurta (M) match
    expect(res.body.data.length).toBe(2);
  });

  it('5. Filters products by inStock status', async () => {
    const res = await request(app)
      .get('/api/v1/products?inStock=true')
      .expect(HTTP_STATUS.OK);

    // Only Red Kurta (qty: 10) and Blue Saree (qty: 5) are in stock; Gold Kurta (qty: 0) is excluded
    expect(res.body.data.length).toBe(2);
    const slugs = (res.body.data as Array<{ slug: string }>).map((p) => p.slug);
    expect(slugs).toContain('red-kurta');
    expect(slugs).toContain('blue-silk-saree');
    expect(slugs).not.toContain('designer-gold-kurta');
  });

  it('6. Combined filters: category, size, and inStock', async () => {
    const res = await request(app)
      .get('/api/v1/products?categorySlug=kurtas&size=m&inStock=true')
      .expect(HTTP_STATUS.OK);

    // Kurtas + Size M + InStock -> Red Kurta only (Gold Kurta is OOS)
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].slug).toBe('red-kurta');
  });

  it('7. GET /api/v1/products/filters returns dynamic filter options accurately', async () => {
    const res = await request(app)
      .get('/api/v1/products/filters')
      .expect(HTTP_STATUS.OK);

    const options = res.body.data;
    expect(options.categories.length).toBe(2);
    expect(options.colors.length).toBe(2); // Red, Blue
    expect(options.sizes.length).toBe(2); // M, L
    expect(options.priceRange.min).toBe(1000);
    expect(options.priceRange.max).toBe(6000);
  });
});
