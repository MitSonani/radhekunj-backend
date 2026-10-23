import { OrderStatus, PaymentMethod, PaymentStatus, ShipmentStatus } from "@prisma/client";
import type { AddressSnapshot } from "../addresses/service.js";
import type { PaymentResponse } from "../payments/types.js";

export { OrderStatus, PaymentMethod, PaymentStatus, ShipmentStatus };

export interface OrderItemResponse {
  id: string;
  orderId: string;
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  attributes: Array<{ name: string; value: string }>;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerShipmentResponse {
  id: string;
  status: ShipmentStatus;
  courierName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
}

export interface ShipmentResponse {
  id: string;
  orderId: string;
  provider: string;
  status: ShipmentStatus;
  trackingNumber: string | null;
  providerShipmentId: string | null;
  providerOrderId: string | null;
  courierName: string | null;
  trackingUrl: string | null;
  bookedAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderResponse {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  subtotal: string;
  discountAmount: string;
  shippingFee: string;
  taxAmount: string;
  totalAmount: string;
  shippingAddress: AddressSnapshot;
  items: OrderItemResponse[];
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  payments?: PaymentResponse[];
  shipment?: CustomerShipmentResponse;
  shipments?: ShipmentResponse[];
  razorpay?: {
    keyId: string;
    razorpayOrderId: string;
    amount: number;
    currency: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderListResponse {
  items: OrderResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PlaceOrderInput {
  shippingAddressId: string;
  paymentMethod?: PaymentMethod;
  idempotencyKey?: string;
}

// ---------------------------------------------------------------------------
// Admin Order Interfaces
// ---------------------------------------------------------------------------

export interface AdminCustomerSummary {
  id: string;
  name: string | null;
  mobileNumber: string;
  countryCode: string;
}

export interface AdminOrderListItem {
  id: string;
  orderNumber: string;
  customer: AdminCustomerSummary;
  status: OrderStatus;
  subtotal: string;
  discountAmount: string;
  shippingFee: string;
  taxAmount: string;
  totalAmount: string;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus | null;
  shipmentStatus: ShipmentStatus | null;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminOrderDetailResponse extends OrderResponse {
  customer: AdminCustomerSummary;
  shipment?: ShipmentResponse;
}

export interface AdminOrderListResponse {
  items: AdminOrderListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminListOrdersFilters {
  search?: string;
  status?: OrderStatus;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  shipmentStatus?: ShipmentStatus;
  startDate?: Date;
  endDate?: Date;
}

export interface CreateShipmentInput {
  trackingNumber?: string;
  courierName?: string;
  trackingUrl?: string;
  providerShipmentId?: string;
  providerOrderId?: string;
  status?: ShipmentStatus;
}

export interface UpdateShipmentStatusInput {
  status: ShipmentStatus;
}

export interface UpdateOrderStatusInput {
  status: OrderStatus;
}

export interface UpdatePaymentStatusInput {
  paymentStatus: PaymentStatus;
}
