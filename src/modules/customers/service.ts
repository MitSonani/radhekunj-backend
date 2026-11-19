import { OrderStatus } from "@prisma/client";
import { AppError, NotFoundError } from "../../shared/errors/appError.js";
import { ROLES } from "../../shared/constants/index.js";
import * as customerRepo from "./repository.js";
import type {
  CustomerDetail,
  CustomerListItem,
  CustomerOrderItem,
  ListCustomersFilters,
} from "./types.js";

function roundCurrency(val: number): number {
  return Math.round(val * 100) / 100;
}

export async function listCustomers(
  filters: ListCustomersFilters,
  pagination: { page: number; limit: number },
): Promise<{
  items: CustomerListItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const where = customerRepo.buildCustomerWhereClause({
    search: filters.search,
    status: filters.status,
  });

  const records = await customerRepo.findCustomerUsers(where);

  // Compute calculated statistics per customer from actual database records
  const allCustomers: CustomerListItem[] = records.map((record) => {
    const totalOrders = record.orders.length;
    const totalSpending = roundCurrency(
      record.orders
        .filter((o) => o.status !== OrderStatus.CANCELLED)
        .reduce((sum, o) => sum + Number(o.totalAmount), 0),
    );

    return {
      id: record.id,
      name: record.name,
      mobileNumber: record.mobileNumber,
      countryCode: record.countryCode,
      isActive: record.isActive,
      totalOrders,
      totalSpending,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  });

  // Sort
  const sortBy = filters.sortBy || "createdAt";
  const sortOrder = filters.sortOrder || "desc";
  const multiplier = sortOrder === "asc" ? 1 : -1;

  allCustomers.sort((a, b) => {
    if (sortBy === "name") {
      return a.name.localeCompare(b.name) * multiplier;
    }
    if (sortBy === "totalOrders") {
      return (a.totalOrders - b.totalOrders) * multiplier;
    }
    if (sortBy === "totalSpending") {
      return (a.totalSpending - b.totalSpending) * multiplier;
    }
    // Default: createdAt
    return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * multiplier;
  });

  const total = allCustomers.length;
  const totalPages = Math.ceil(total / pagination.limit) || 1;
  const startIndex = (pagination.page - 1) * pagination.limit;
  const items = allCustomers.slice(startIndex, startIndex + pagination.limit);

  return {
    items,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages,
    },
  };
}

export async function getCustomerById(id: string): Promise<CustomerDetail> {
  const record = await customerRepo.findCustomerById(id);

  if (!record) {
    throw new NotFoundError("Customer not found");
  }

  // Ensure this is not an administrator
  if (record.role?.name?.trim().toLowerCase() === ROLES.ADMIN) {
    throw new NotFoundError("Customer not found");
  }

  const totalOrders = record.orders.length;
  const totalSpending = roundCurrency(
    record.orders
      .filter((o) => o.status !== OrderStatus.CANCELLED)
      .reduce((sum, o) => sum + Number(o.totalAmount), 0),
  );

  const orders: CustomerOrderItem[] = record.orders.map((o) => {
    const primaryPayment = o.payments[0];
    const primaryShipment = o.shipments[0];

    return {
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      subtotal: o.subtotal.toString(),
      discountAmount: o.discountAmount.toString(),
      shippingFee: o.shippingFee.toString(),
      taxAmount: o.taxAmount.toString(),
      totalAmount: o.totalAmount.toString(),
      itemCount: o.items.length,
      paymentMethod: primaryPayment?.paymentMethod ?? null,
      paymentStatus: primaryPayment?.paymentStatus ?? null,
      shipmentStatus: primaryShipment?.status ?? null,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    };
  });

  const addresses = record.addresses.map((a) => ({
    id: a.id,
    fullName: a.fullName,
    mobileNumber: a.mobileNumber,
    countryCode: a.countryCode,
    addressLine1: a.addressLine1,
    addressLine2: a.addressLine2,
    city: a.city,
    state: a.state,
    postalCode: a.postalCode,
    country: a.country,
    label: a.label,
    isDefault: a.isDefault,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));

  return {
    id: record.id,
    name: record.name,
    mobileNumber: record.mobileNumber,
    countryCode: record.countryCode,
    isActive: record.isActive,
    roleName: record.role?.name ?? null,
    totalOrders,
    totalSpending,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    addresses,
    orders,
  };
}

export async function setCustomerStatus(
  id: string,
  isActive: boolean,
  currentAdminId?: string,
) {
  const existing = await customerRepo.findCustomerById(id);

  if (!existing) {
    throw new NotFoundError("Customer not found");
  }

  if (existing.role?.name?.trim().toLowerCase() === ROLES.ADMIN) {
    throw new AppError(400, "Cannot modify status of an administrator account");
  }

  if (currentAdminId && existing.id === currentAdminId) {
    throw new AppError(400, "Cannot modify your own account status");
  }

  return customerRepo.updateCustomerStatus(id, isActive);
}

