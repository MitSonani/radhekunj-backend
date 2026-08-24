import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { getPaginationOffset } from '../../shared/utils/pagination.js';

export const attributeSelect = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: { values: true },
  },
} satisfies Prisma.AttributeSelect;

export const attributeValueSelect = {
  id: true,
  attributeId: true,
  value: true,
  slug: true,
  colorCode: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AttributeValueSelect;

export type AttributeRecord = Prisma.AttributeGetPayload<{ select: typeof attributeSelect }>;
export type AttributeValueRecord = Prisma.AttributeValueGetPayload<{ select: typeof attributeValueSelect }>;

export type AttributeListFilters = {
  search?: string;
};

export type AttributeValueListFilters = {
  search?: string;
};

export type CreateAttributeData = {
  name: string;
  slug: string;
};

export type UpdateAttributeData = {
  name?: string;
  slug?: string;
};

export type CreateAttributeValueData = {
  attributeId: string;
  value: string;
  slug: string;
  colorCode?: string | null;
};

export type UpdateAttributeValueData = {
  value?: string;
  slug?: string;
  colorCode?: string | null;
};

function buildAttributeWhere(filters: AttributeListFilters): Prisma.AttributeWhereInput {
  if (!filters.search) {
    return {};
  }

  return {
    OR: [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { slug: { contains: filters.search, mode: 'insensitive' } },
    ],
  };
}

function buildValueWhere(
  attributeId: string,
  filters: AttributeValueListFilters,
): Prisma.AttributeValueWhereInput {
  const where: Prisma.AttributeValueWhereInput = { attributeId };

  if (filters.search) {
    where.OR = [
      { value: { contains: filters.search, mode: 'insensitive' } },
      { slug: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  return where;
}

export async function findById(id: string): Promise<AttributeRecord | null> {
  return prisma.attribute.findUnique({
    where: { id },
    select: attributeSelect,
  });
}

export async function findByNameInsensitive(
  name: string,
  excludeId?: string,
): Promise<{ id: string } | null> {
  return prisma.attribute.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
}

export async function findBySlug(slug: string, excludeId?: string): Promise<{ id: string } | null> {
  return prisma.attribute.findFirst({
    where: {
      slug,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
}

export async function findMany(
  filters: AttributeListFilters,
  page: number,
  limit: number,
): Promise<AttributeRecord[]> {
  return prisma.attribute.findMany({
    where: buildAttributeWhere(filters),
    orderBy: { createdAt: 'desc' },
    skip: getPaginationOffset(page, limit),
    take: limit,
    select: attributeSelect,
  });
}

export async function count(filters: AttributeListFilters): Promise<number> {
  return prisma.attribute.count({
    where: buildAttributeWhere(filters),
  });
}

export async function create(data: CreateAttributeData): Promise<AttributeRecord> {
  return prisma.attribute.create({
    data,
    select: attributeSelect,
  });
}

export async function update(id: string, data: UpdateAttributeData): Promise<AttributeRecord> {
  return prisma.attribute.update({
    where: { id },
    data,
    select: attributeSelect,
  });
}

export async function remove(id: string): Promise<AttributeRecord> {
  return prisma.attribute.delete({
    where: { id },
    select: attributeSelect,
  });
}

export async function findValueById(
  attributeId: string,
  valueId: string,
): Promise<AttributeValueRecord | null> {
  return prisma.attributeValue.findFirst({
    where: { id: valueId, attributeId },
    select: attributeValueSelect,
  });
}

export async function findValueByValueInsensitive(
  attributeId: string,
  value: string,
  excludeId?: string,
): Promise<{ id: string } | null> {
  return prisma.attributeValue.findFirst({
    where: {
      attributeId,
      value: { equals: value, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
}

export async function findValueBySlug(
  attributeId: string,
  slug: string,
  excludeId?: string,
): Promise<{ id: string } | null> {
  return prisma.attributeValue.findFirst({
    where: {
      attributeId,
      slug,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
}

export async function findValues(
  attributeId: string,
  filters: AttributeValueListFilters,
  page: number,
  limit: number,
): Promise<AttributeValueRecord[]> {
  return prisma.attributeValue.findMany({
    where: buildValueWhere(attributeId, filters),
    orderBy: { createdAt: 'asc' },
    skip: getPaginationOffset(page, limit),
    take: limit,
    select: attributeValueSelect,
  });
}

export async function countValues(
  attributeId: string,
  filters: AttributeValueListFilters = {},
): Promise<number> {
  return prisma.attributeValue.count({
    where: buildValueWhere(attributeId, filters),
  });
}

export async function createValue(data: CreateAttributeValueData): Promise<AttributeValueRecord> {
  return prisma.attributeValue.create({
    data,
    select: attributeValueSelect,
  });
}

export async function updateValue(
  id: string,
  data: UpdateAttributeValueData,
): Promise<AttributeValueRecord> {
  return prisma.attributeValue.update({
    where: { id },
    data,
    select: attributeValueSelect,
  });
}

export async function removeValue(id: string): Promise<AttributeValueRecord> {
  return prisma.attributeValue.delete({
    where: { id },
    select: attributeValueSelect,
  });
}
