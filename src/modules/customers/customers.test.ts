/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../../app.js";
import { prisma } from "../../database/prisma.js";
import { appConfig } from "../../config/index.js";
import { HTTP_STATUS } from "../../shared/constants/index.js";

const app = createApp();

describe("Admin Customers Module", () => {
  let adminId: string;
  let adminToken: string;
  let customer1Id: string;
  let customer2Id: string;
  let customerToken: string;

  beforeEach(async () => {
    // 1. Roles
    const adminRole = await prisma.role.create({ data: { name: "admin" } });
    const customerRole = await prisma.role.create({ data: { name: "customer" } });

    // 2. Admin User
    const adminUser = await prisma.user.create({
      data: {
        name: "Admin User",
        mobileNumber: "+919999999999",
        countryCode: "+91",
        roleId: adminRole.id,
      },
    });
    adminId = adminUser.id;
    adminToken = jwt.sign(
      { id: adminUser.id, role: "admin", mobileNumber: adminUser.mobileNumber },
      appConfig.jwtSecret,
    );

    // 3. Customer 1 (with 2 orders: 1 confirmed, 1 cancelled)
    const cust1 = await prisma.user.create({
      data: {
        name: "Aarav Sharma",
        mobileNumber: "9876543210",
        countryCode: "+91",
        roleId: customerRole.id,
        isActive: true,
      },
    });
    customer1Id = cust1.id;
    customerToken = jwt.sign(
      { id: cust1.id, role: "customer", mobileNumber: cust1.mobileNumber },
      appConfig.jwtSecret,
    );

    // Customer 1 address
    await prisma.address.create({
      data: {
        userId: customer1Id,
        fullName: "Aarav Sharma",
        countryCode: "+91",
        mobileNumber: "9876543210",
        addressLine1: "123 MG Road",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560001",
        country: "India",
        label: "Home",
        isDefault: true,
      },
    });

    // Customer 1 orders
    await prisma.order.create({
      data: {
        orderNumber: "ORD-CUST1-01",
        userId: customer1Id,
        status: "CONFIRMED",
        subtotal: 1000,
        totalAmount: 1000,
        shippingAddress: { city: "Bengaluru" },
      },
    });

    await prisma.order.create({
      data: {
        orderNumber: "ORD-CUST1-02",
        userId: customer1Id,
        status: "CANCELLED",
        subtotal: 500,
        totalAmount: 500,
        shippingAddress: { city: "Bengaluru" },
      },
    });

    // 4. Customer 2 (with 1 confirmed order, disabled status)
    const cust2 = await prisma.user.create({
      data: {
        name: "Pooja Patel",
        mobileNumber: "9123456789",
        countryCode: "+91",
        roleId: customerRole.id,
        isActive: false,
      },
    });
    customer2Id = cust2.id;

    await prisma.order.create({
      data: {
        orderNumber: "ORD-CUST2-01",
        userId: customer2Id,
        status: "DELIVERED",
        subtotal: 2500,
        totalAmount: 2500,
        shippingAddress: { city: "Ahmedabad" },
      },
    });
  });

  describe("Authentication & Authorization", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const res = await request(app).get("/api/v1/admin/customers");
      expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    });

    it("rejects non-admin customers with 403", async () => {
      const res = await request(app)
        .get("/api/v1/admin/customers")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(res.status).toBe(HTTP_STATUS.FORBIDDEN);
    });
  });

  describe("GET /api/v1/admin/customers (Listing)", () => {
    it("returns real customers with calculated order and spending statistics", async () => {
      const res = await request(app)
        .get("/api/v1/admin/customers")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);

      // Verify admin user is NOT included
      const ids = res.body.data.map((c: { id: string }) => c.id);
      expect(ids).not.toContain(adminId);

      // Verify Customer 1 stats: 2 total orders, 1000 spending (cancelled 500 excluded)
      const c1 = res.body.data.find((c: { id: string }) => c.id === customer1Id);
      expect(c1).toBeDefined();
      expect(c1.name).toBe("Aarav Sharma");
      expect(c1.mobileNumber).toBe("9876543210");
      expect(c1.isActive).toBe(true);
      expect(c1.totalOrders).toBe(2);
      expect(c1.totalSpending).toBe(1000);

      // Verify Customer 2 stats: 1 total order, 2500 spending
      const c2 = res.body.data.find((c: { id: string }) => c.id === customer2Id);
      expect(c2).toBeDefined();
      expect(c2.name).toBe("Pooja Patel");
      expect(c2.isActive).toBe(false);
      expect(c2.totalOrders).toBe(1);
      expect(c2.totalSpending).toBe(2500);
    });

    it("searches customers by name", async () => {
      const res = await request(app)
        .get("/api/v1/admin/customers?search=pooja")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe("Pooja Patel");
    });

    it("searches customers by mobile number", async () => {
      const res = await request(app)
        .get("/api/v1/admin/customers?search=98765")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe("Aarav Sharma");
    });

    it("filters customers by account status", async () => {
      const activeRes = await request(app)
        .get("/api/v1/admin/customers?status=ACTIVE")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(activeRes.status).toBe(HTTP_STATUS.OK);
      expect(activeRes.body.data).toHaveLength(1);
      expect(activeRes.body.data[0].id).toBe(customer1Id);

      const disabledRes = await request(app)
        .get("/api/v1/admin/customers?status=DISABLED")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(disabledRes.status).toBe(HTTP_STATUS.OK);
      expect(disabledRes.body.data).toHaveLength(1);
      expect(disabledRes.body.data[0].id).toBe(customer2Id);
    });

    it("sorts customers by totalSpending desc", async () => {
      const res = await request(app)
        .get("/api/v1/admin/customers?sortBy=totalSpending&sortOrder=desc")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data[0].id).toBe(customer2Id); // 2500
      expect(res.body.data[1].id).toBe(customer1Id); // 1000
    });

    it("supports pagination", async () => {
      const res = await request(app)
        .get("/api/v1/admin/customers?page=1&limit=1")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination).toMatchObject({
        page: 1,
        limit: 1,
        total: 2,
        totalPages: 2,
      });
    });
  });

  describe("GET /api/v1/admin/customers/:id (Details)", () => {
    it("returns complete customer profile, saved addresses and order history", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/customers/${customer1Id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(customer1Id);
      expect(res.body.data.name).toBe("Aarav Sharma");
      expect(res.body.data.mobileNumber).toBe("9876543210");
      expect(res.body.data.countryCode).toBe("+91");
      expect(res.body.data.isActive).toBe(true);
      expect(res.body.data.totalOrders).toBe(2);
      expect(res.body.data.totalSpending).toBe(1000);

      // Saved addresses
      expect(res.body.data.addresses).toHaveLength(1);
      expect(res.body.data.addresses[0].addressLine1).toBe("123 MG Road");
      expect(res.body.data.addresses[0].city).toBe("Bengaluru");
      expect(res.body.data.addresses[0].isDefault).toBe(true);

      // Order history
      expect(res.body.data.orders).toHaveLength(2);
      expect(res.body.data.orders[0].orderNumber).toBeDefined();
    });

    it("returns 404 for nonexistent customer ID", async () => {
      const res = await request(app)
        .get("/api/v1/admin/customers/00000000-0000-0000-0000-000000000000")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(HTTP_STATUS.NOT_FOUND);
    });

    it("returns 404 if attempting to view an admin user via customer details", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/customers/${adminId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(HTTP_STATUS.NOT_FOUND);
    });
  });

  describe("PATCH /api/v1/admin/customers/:id/status (Actions)", () => {
    it("safely disables and re-enables a customer account", async () => {
      // 1. Disable customer 1
      const disableRes = await request(app)
        .patch(`/api/v1/admin/customers/${customer1Id}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(disableRes.status).toBe(HTTP_STATUS.OK);
      expect(disableRes.body.data.isActive).toBe(false);

      // Verify in DB
      const updatedUser = await prisma.user.findUnique({ where: { id: customer1Id } });
      expect(updatedUser?.isActive).toBe(false);

      // Verify disabled customer cannot use authenticated endpoints
      const authRes = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(authRes.status).toBe(HTTP_STATUS.FORBIDDEN);

      // 2. Re-enable customer 1
      const enableRes = await request(app)
        .patch(`/api/v1/admin/customers/${customer1Id}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isActive: true });

      expect(enableRes.status).toBe(HTTP_STATUS.OK);
      expect(enableRes.body.data.isActive).toBe(true);

      const reEnabledUser = await prisma.user.findUnique({ where: { id: customer1Id } });
      expect(reEnabledUser?.isActive).toBe(true);
    });

    it("rejects modifying status of an admin account", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/customers/${adminId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(res.status).toBe(HTTP_STATUS.BAD_REQUEST);
    });

    it("validates that isActive is a boolean", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/customers/${customer1Id}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isActive: "invalid" });

      expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    });
  });
});

