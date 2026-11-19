import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma.js";
import { ROLES } from "../../shared/constants/index.js";
import type { CustomerAccountStatusFilter } from "./types.js";

export const customerListSelect = {
  id: true,
  name: true,
  mobileNumber: true,
  countryCode: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  role: {
    select: {
      name: true,
    },
  },
  orders: {
    select: {
      id: true,
      status: true,
      totalAmount: true,
    },
  },
} satisfies Prisma.UserSelect;

export function buildCustomerWhereClause(options: {
  search?: string;
  status?: CustomerAccountStatusFilter;
}): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {
    OR: [
      { role: { name: { not: ROLES.ADMIN } } },
      { roleId: null },
    ],
  };

  const andConditions: Prisma.UserWhereInput[] = [];

  if (options.status && options.status !== "ALL") {
    andConditions.push({
      isActive: options.status === "ACTIVE",
    });
  }

  if (options.search) {
    const term = options.search.trim();
    andConditions.push({
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { mobileNumber: { contains: term } },
      ],
    });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  return where;
}

export async function findCustomerUsers(where: Prisma.UserWhereInput) {
  return prisma.user.findMany({
    where,
    select: customerListSelect,
    orderBy: { createdAt: "desc" },
  });
}

export async function countCustomerUsers(where: Prisma.UserWhereInput): Promise<number> {
  return prisma.user.count({ where });
}

export async function findCustomerById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      mobileNumber: true,
      countryCode: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      role: {
        select: {
          id: true,
          name: true,
        },
      },
      addresses: {
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      },
      orders: {
        orderBy: { createdAt: "desc" },
        include: {
          items: {
            select: { id: true },
          },
          payments: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          shipments: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });
}

export async function updateCustomerStatus(id: string, isActive: boolean) {
  return prisma.user.update({
    where: { id },
    data: { isActive },
    select: {
      id: true,
      name: true,
      mobileNumber: true,
      isActive: true,
      updatedAt: true,
    },
  });
}

