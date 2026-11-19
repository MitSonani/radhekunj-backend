import type { OrderStatus, PaymentMethod, PaymentStatus, ShipmentStatus } from "@prisma/client";

export type CustomerAccountStatusFilter = "ALL" | "ACTIVE" | "DISABLED";
export type CustomerSortBy = "createdAt" | "name" | "totalOrders" | "totalSpending";
export type SortOrder = "asc" | "desc";

export interface ListCustomersFilters {
  search?: string;
  status?: CustomerAccountStatusFilter;
  sortBy?: CustomerSortBy;
  sortOrder?: SortOrder;
}

export interface CustomerListItem {
  id: string;
  name: string;
  mobileNumber: string;
  countryCode: string | null;
  isActive: boolean;
  totalOrders: number;
  totalSpending: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerAddressItem {
  id: string;
  fullName: string;
  mobileNumber: string;
  countryCode: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  label: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerOrderItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  subtotal: string;
  discountAmount: string;
  shippingFee: string;
  taxAmount: string;
  totalAmount: string;
  itemCount: number;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus | null;
  shipmentStatus: ShipmentStatus | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDetail {
  id: string;
  name: string;
  mobileNumber: string;
  countryCode: string | null;
  isActive: boolean;
  roleName: string | null;
  totalOrders: number;
  totalSpending: number;
  createdAt: string;
  updatedAt: string;
  addresses: CustomerAddressItem[];
  orders: CustomerOrderItem[];
}

