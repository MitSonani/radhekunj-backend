/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../../app.js";
import { prisma } from "../../database/prisma.js";
import { appConfig } from "../../config/index.js";
import { HTTP_STATUS } from "../../shared/constants/index.js";

const app = createApp();

describe("Admin Orders Module & Manual Shipment Workflow", () => {
  let _adminId: string;
  let adminToken: string;
  let customerId: string;
  let customerToken: string;
  let orderId: string;
  let orderNumber: string;
  let codPaymentId: string;

  beforeEach(async () => {
    // Roles
    const adminRole = await prisma.role.create({ data: { name: "admin" } });
    const customerRole = await prisma.role.create({ data: { name: "customer" } });

    // Admin user
    const adminUser = await prisma.user.create({
      data: {
        name: "Admin Manager",
        mobileNumber: "+918888888888",
        countryCode: "+91",
        roleId: adminRole.id,
      },
    });
    _adminId = adminUser.id;
    adminToken = jwt.sign(
      { id: adminUser.id, role: "admin", mobileNumber: adminUser.mobileNumber },
      appConfig.jwtSecret,
    );

    // Customer user
    const customerUser = await prisma.user.create({
      data: {
        name: "Aarav Sharma",
        mobileNumber: "+919999900001",
        countryCode: "+91",
        roleId: customerRole.id,
      },
    });
    customerId = customerUser.id;
    customerToken = jwt.sign(
      { id: customerUser.id, role: "customer", mobileNumber: customerUser.mobileNumber },
      appConfig.jwtSecret,
    );

    // Catalog & inventory
    const category = await prisma.category.create({
      data: { name: "Kurtas", slug: "kurtas", status: "ACTIVE" },
    });

    const product = await prisma.product.create({
      data: {
        name: "Raw Silk Kurta",
        slug: "raw-silk-kurta",
        categoryId: category.id,
        basePrice: 4500.0,
        status: "ACTIVE",
      },
    });

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: "RSK-M",
        price: 4500.0,
        status: "ACTIVE",
      },
    });

    // Create an initial test order (COD, CONFIRMED)
    const order = await prisma.order.create({
      data: {
        orderNumber: "ORD-TEST-0001",
        userId: customerId,
        status: "CONFIRMED",
        subtotal: 4500.0,
        discountAmount: 0.0,
        shippingFee: 0.0,
        taxAmount: 0.0,
        totalAmount: 4500.0,
        shippingAddress: {
          fullName: "Aarav Sharma",
          countryCode: "+91",
          mobileNumber: "9999900001",
          addressLine1: "101 Heritage Villa",
          city: "Jaipur",
          state: "Rajasthan",
          postalCode: "302001",
          country: "India",
        },
        items: {
          create: [
            {
              productId: product.id,
              variantId: variant.id,
              sku: variant.sku,
              productName: product.name,
              attributes: [{ name: "Size", value: "M" }],
              unitPrice: 4500.0,
              quantity: 1,
              lineTotal: 4500.0,
            },
          ],
        },
      },
    });
    orderId = order.id;
    orderNumber = order.orderNumber;

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        paymentMethod: "COD",
        paymentStatus: "PENDING",
        amount: 4500.0,
        currency: "INR",
      },
    });
    codPaymentId = payment.id;
  });

  // -------------------------------------------------------------------------
  // 1. Authorization & Security
  // -------------------------------------------------------------------------
  describe("Security & Authorization", () => {
    it("should reject unauthenticated request to /admin/orders with 401", async () => {
      const res = await request(app)
        .get("/api/v1/admin/orders")
        .expect(HTTP_STATUS.UNAUTHORIZED);

      expect(res.body.success).toBe(false);
    });

    it("should reject customer access to /admin/orders with 403 Forbidden", async () => {
      const res = await request(app)
        .get("/api/v1/admin/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .expect(HTTP_STATUS.FORBIDDEN);

      expect(res.body.success).toBe(false);
    });

    it("should reject customer access to /admin/orders/:id with 403 Forbidden", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/orders/${orderId}`)
        .set("Authorization", `Bearer ${customerToken}`)
        .expect(HTTP_STATUS.FORBIDDEN);

      expect(res.body.success).toBe(false);
    });

    it("should allow admin access to /admin/orders with 200 OK", async () => {
      const res = await request(app)
        .get("/api/v1/admin/orders")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(HTTP_STATUS.OK);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].orderNumber).toBe(orderNumber);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Order Listing & Filters
  // -------------------------------------------------------------------------
  describe("Admin Order Listing & Filters", () => {
    it("should support filtering orders by status and paymentMethod", async () => {
      // Create a second order with PENDING_PAYMENT / RAZORPAY
      await prisma.order.create({
        data: {
          orderNumber: "ORD-TEST-0002",
          userId: customerId,
          status: "PENDING_PAYMENT",
          subtotal: 9000.0,
          totalAmount: 9000.0,
          shippingAddress: { fullName: "Aarav Sharma" },
          payments: {
            create: {
              paymentMethod: "RAZORPAY",
              paymentStatus: "PENDING",
              amount: 9000.0,
            },
          },
        },
      });

      // Filter by CONFIRMED
      const resConfirmed = await request(app)
        .get("/api/v1/admin/orders?status=CONFIRMED")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(HTTP_STATUS.OK);
      expect(resConfirmed.body.data.length).toBe(1);
      expect(resConfirmed.body.data[0].orderNumber).toBe("ORD-TEST-0001");

      // Filter by RAZORPAY
      const resRazorpay = await request(app)
        .get("/api/v1/admin/orders?paymentMethod=RAZORPAY")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(HTTP_STATUS.OK);
      expect(resRazorpay.body.data.length).toBe(1);
      expect(resRazorpay.body.data[0].orderNumber).toBe("ORD-TEST-0002");
    });

    it("should support search by orderNumber and customer name", async () => {
      const resSearch = await request(app)
        .get("/api/v1/admin/orders?search=ORD-TEST-0001")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(HTTP_STATUS.OK);
      expect(resSearch.body.data.length).toBe(1);

      const resCustomer = await request(app)
        .get("/api/v1/admin/orders?search=Aarav")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(HTTP_STATUS.OK);
      expect(resCustomer.body.data.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Admin Order Details
  // -------------------------------------------------------------------------
  describe("Admin Order Details", () => {
    it("should return complete order details with customer, items, address, and payment info", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/orders/${orderId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(HTTP_STATUS.OK);

      const data = res.body.data;
      expect(data.id).toBe(orderId);
      expect(data.orderNumber).toBe(orderNumber);
      expect(data.customer.name).toBe("Aarav Sharma");
      expect(data.customer.mobileNumber).toBe("+919999900001");
      expect(data.shippingAddress.city).toBe("Jaipur");
      expect(data.items.length).toBe(1);
      expect(data.items[0].sku).toBe("RSK-M");
      expect(data.payments.length).toBe(1);
      expect(data.payments[0].paymentMethod).toBe("COD");
      expect(data.payments[0].paymentStatus).toBe("PENDING");
    });
  });

  // -------------------------------------------------------------------------
  // 4. Order Status State Transitions
  // -------------------------------------------------------------------------
  describe("Order Status State Machine", () => {
    it("should allow valid transition from CONFIRMED to SHIPPED and SHIPPED to DELIVERED", async () => {
      // CONFIRMED -> SHIPPED
      const resShipped = await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "SHIPPED" })
        .expect(HTTP_STATUS.OK);

      expect(resShipped.body.data.status).toBe("SHIPPED");

      // SHIPPED -> DELIVERED
      const resDelivered = await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "DELIVERED" })
        .expect(HTTP_STATUS.OK);

      expect(resDelivered.body.data.status).toBe("DELIVERED");
    });

    it("should reject invalid transition from DELIVERED to PENDING_PAYMENT with 400 Bad Request", async () => {
      // First advance to DELIVERED
      await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "SHIPPED" });
      await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "DELIVERED" });

      // Attempt invalid transition back
      const res = await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "PENDING_PAYMENT" })
        .expect(HTTP_STATUS.BAD_REQUEST);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/cannot transition/i);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Manual Shiprocket Workflow & Synchronization
  // -------------------------------------------------------------------------
  describe("Manual Shipment Booking & Order Synchronization", () => {
    it("should create a manual shipment for an order and automatically sync order status to SHIPPED", async () => {
      const res = await request(app)
        .post(`/api/v1/admin/orders/${orderId}/shipment`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          courierName: "Blue Dart via Shiprocket",
          trackingNumber: "SR123456789IN",
          trackingUrl: "https://shiprocket.co/tracking/SR123456789IN",
          providerShipmentId: "sr_ship_9988",
          providerOrderId: "sr_ord_1122",
          status: "BOOKED",
        })
        .expect(HTTP_STATUS.CREATED);

      const orderData = res.body.data;
      // Order automatically transitions from CONFIRMED -> SHIPPED
      expect(orderData.status).toBe("SHIPPED");
      expect(orderData.shipment).toBeDefined();
      expect(orderData.shipment.trackingNumber).toBe("SR123456789IN");
      expect(orderData.shipment.courierName).toBe("Blue Dart via Shiprocket");
      expect(orderData.shipment.status).toBe("BOOKED");
      expect(orderData.shipment.providerShipmentId).toBe("sr_ship_9988");
    });

    it("should reject creating a second active shipment when one already exists", async () => {
      // First shipment
      await request(app)
        .post(`/api/v1/admin/orders/${orderId}/shipment`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          courierName: "Delhivery",
          trackingNumber: "DL99887766",
          status: "BOOKED",
        })
        .expect(HTTP_STATUS.CREATED);

      // Attempt duplicate shipment
      const res = await request(app)
        .post(`/api/v1/admin/orders/${orderId}/shipment`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          courierName: "Shadowfax",
          trackingNumber: "SF11223344",
          status: "BOOKED",
        })
        .expect(HTTP_STATUS.BAD_REQUEST);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/active shipment already exists/i);
    });

    it("should update shipment status through valid transitions and synchronize order to DELIVERED", async () => {
      const shipRes = await request(app)
        .post(`/api/v1/admin/orders/${orderId}/shipment`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          courierName: "Blue Dart",
          trackingNumber: "BD00112233",
          status: "BOOKED",
        });

      const shipmentId = shipRes.body.data.shipment.id;

      // Update to IN_TRANSIT
      const resTransit = await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/shipment/${shipmentId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "IN_TRANSIT" })
        .expect(HTTP_STATUS.OK);

      expect(resTransit.body.data.shipment.status).toBe("IN_TRANSIT");

      // Update to DELIVERED
      const resDelivered = await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/shipment/${shipmentId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "DELIVERED" })
        .expect(HTTP_STATUS.OK);

      expect(resDelivered.body.data.shipment.status).toBe("DELIVERED");
      // Order automatically transitions to DELIVERED
      expect(resDelivered.body.data.status).toBe("DELIVERED");
    });

    it("should reject invalid shipment status transition with 400 Bad Request", async () => {
      const shipRes = await request(app)
        .post(`/api/v1/admin/orders/${orderId}/shipment`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          courierName: "Blue Dart",
          trackingNumber: "BD00112233",
          status: "BOOKED",
        });

      const shipmentId = shipRes.body.data.shipment.id;

      // Try jumping directly from BOOKED to DELIVERED
      const res = await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/shipment/${shipmentId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "DELIVERED" })
        .expect(HTTP_STATUS.BAD_REQUEST);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/cannot transition shipment status/i);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Payment Status Management (e.g. COD collection)
  // -------------------------------------------------------------------------
  describe("Payment Status Management", () => {
    it("should allow admin to record COD cash collection and mark payment as PAID", async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/payments/${codPaymentId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ paymentStatus: "PAID" })
        .expect(HTTP_STATUS.OK);

      const orderData = res.body.data;
      expect(orderData.paymentStatus).toBe("PAID");
      const codPayment = (orderData.payments as Array<{ id: string; paymentStatus: string; paidAt?: string }>).find((p) => p.id === codPaymentId);
      expect(codPayment).toBeDefined();
      expect(codPayment?.paymentStatus).toBe("PAID");
      expect(codPayment?.paidAt).toBeDefined();
    });
  });
});
