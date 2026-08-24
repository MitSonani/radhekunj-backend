import { CategoryStatus, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { getPaginationOffset } from '../../shared/utils/pagination.js';

export const categorySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  imageKey: true,
  imageUrl: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CategorySelect;

export type CategoryRecord = Prisma.CategoryGetPayload<{ select: typeof categorySelect }>;

export type CategoryListFilters = {
  search?: string;
  status?: CategoryStatus;
};

export type CreateCategoryData = {
  name: string;
  slug: string;
  description?: string | null;
  status?: CategoryStatus;
  imageKey?: string | null;
  imageUrl?: string | null;
};

export type UpdateCategoryData = {
  name?: string;
  slug?: string;
  description?: string | null;
  status?: CategoryStatus;
  imageKey?: string | null;
  imageUrl?: string | null;
};

function buildListWhere(filters: CategoryListFilters): Prisma.CategoryWhereInput {
  const where: Prisma.CategoryWhereInput = {};

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { slug: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  return where;
}

export async function findById(id: string): Promise<CategoryRecord | null> {
  return prisma.category.findUnique({
    where: { id },
    select: categorySelect,
  });
}

export async function findByNameInsensitive(
  name: string,
  excludeId?: string,
): Promise<{ id: string } | null> {
  return prisma.category.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
}

export async function findBySlug(slug: string, excludeId?: string): Promise<{ id: string } | null> {
  return prisma.category.findFirst({
    where: {
      slug,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
}

export async function findMany(
  filters: CategoryListFilters,
  page: number,
  limit: number,
): Promise<CategoryRecord[]> {
  return prisma.category.findMany({
    where: buildListWhere(filters),
    orderBy: { createdAt: 'desc' },
    skip: getPaginationOffset(page, limit),
    take: limit,
    select: categorySelect,
  });
}

export async function count(filters: CategoryListFilters): Promise<number> {
  return prisma.category.count({
    where: buildListWhere(filters),
  });
}

export async function create(data: CreateCategoryData): Promise<CategoryRecord> {
  return prisma.category.create({
    data,
    select: categorySelect,
  });
}

export async function update(id: string, data: UpdateCategoryData): Promise<CategoryRecord> {
  return prisma.category.update({
    where: { id },
    data,
    select: categorySelect,
  });
}

export async function remove(id: string): Promise<CategoryRecord> {
  return prisma.category.delete({
    where: { id },
    select: categorySelect,
  });
}
