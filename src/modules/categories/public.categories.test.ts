/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
const app = createApp();
import { prisma } from "../../database/prisma.js";
import { HTTP_STATUS } from "../../shared/constants/index.js";

async function cleanCategories() {
  await prisma.product.deleteMany().catch(() => {});
  await prisma.category.deleteMany().catch(() => {});
}

describe("Public Categories API — GET /api/v1/categories", () => {
  beforeEach(async () => {
    await cleanCategories();
  });

  afterAll(async () => {
    await cleanCategories();
  });

  it("should return only active categories with public fields", async () => {
    // 1. Create active and inactive categories
    await prisma.category.create({
      data: {
        name: "Active Sarees",
        slug: "active-sarees",
        description: "Finest silk sarees",
        status: "ACTIVE",
        imageKey: "categories/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.jpg",
        imageUrl: "https://example.com/saree.jpg",
      },
    });

    await prisma.category.create({
      data: {
        name: "Inactive Archival",
        slug: "inactive-archival",
        description: "Archived collections",
        status: "INACTIVE",
      },
    });

    // 2. Query public endpoint
    const res = await request(app)
      .get("/api/v1/categories")
      .expect(HTTP_STATUS.OK);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);

    const cat = res.body.data[0];
    expect(cat.name).toBe("Active Sarees");
    expect(cat.slug).toBe("active-sarees");
    expect(cat.description).toBe("Finest silk sarees");
    expect(cat.imageUrl).toBe("https://example.com/saree.jpg");

    // Must NOT expose private admin fields
    expect(cat.imageKey).toBeUndefined();
    expect(cat.status).toBeUndefined();

    // Check pagination structure
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBe(1);
    expect(res.body.pagination.page).toBe(1);
  });

  it("should support pagination", async () => {
    for (let i = 1; i <= 5; i++) {
      await prisma.category.create({
        data: {
          name: `Category ${i}`,
          slug: `category-${i}`,
          status: "ACTIVE",
        },
      });
    }

    const res = await request(app)
      .get("/api/v1/categories?page=1&limit=2")
      .expect(HTTP_STATUS.OK);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.total).toBe(5);
    expect(res.body.pagination.totalPages).toBe(3);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(2);
  });

  it("should filter categories by search term case-insensitively", async () => {
    await prisma.category.create({
      data: { name: "Silk Kurtas", slug: "silk-kurtas", status: "ACTIVE" },
    });
    await prisma.category.create({
      data: { name: "Cotton Dupattas", slug: "cotton-dupattas", status: "ACTIVE" },
    });

    const res = await request(app)
      .get("/api/v1/categories?search=silk")
      .expect(HTTP_STATUS.OK);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("Silk Kurtas");
  });

  it("should reject invalid pagination parameters with 422", async () => {
    const res = await request(app)
      .get("/api/v1/categories?page=0")
      .expect(HTTP_STATUS.UNPROCESSABLE);

    expect(res.body.success).toBe(false);
  });
});
