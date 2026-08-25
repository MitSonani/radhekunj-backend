import { Prisma } from '@prisma/client';
import { AppError, NotFoundError, ValidationError } from '../../shared/errors/appError.js';
import { generateSlug, withSlugSuffix } from '../../shared/utils/slug.js';
import { buildPaginationMeta } from '../../shared/utils/pagination.js';
import * as attributeRepository from './repository.js';
import type {
  AttributeRecord,
  AttributeValueRecord,
  UpdateAttributeData,
  UpdateAttributeValueData,
} from './repository.js';
import { PaginationMeta } from '../../shared/types/index.js';

export type Attribute = {
  id: string;
  name: string;
  slug: string;
  valueCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type AttributeValue = AttributeValueRecord;

export type CreateAttributeInput = {
  name: string;
};

export type UpdateAttributeInput = {
  name?: string;
};

export type ListAttributesInput = {
  page: number;
  limit: number;
  search?: string;
};

export type CreateAttributeValueInput = {
  value: string;
  colorCode?: string;
};

export type UpdateAttributeValueInput = {
  value?: string;
  colorCode?: string | null;
};

export type ListAttributeValuesInput = {
  page: number;
  limit: number;
  search?: string;
};

function toAttribute(record: AttributeRecord): Attribute {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    valueCount: record._count.values,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function isForeignKeyConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}

function slugFromLabel(label: string, kind: 'attribute' | 'value'): string {
  const slug = generateSlug(label);

  if (!slug) {
    throw new ValidationError(
      kind === 'attribute'
        ? 'Attribute name must contain letters or numbers'
        : 'Attribute value must contain letters or numbers',
    );
  }

  return slug;
}

async function ensureUniqueAttributeName(name: string, excludeId?: string): Promise<void> {
  const existing = await attributeRepository.findByNameInsensitive(name, excludeId);

  if (existing) {
    throw new AppError(409, `Attribute name "${name}" already exists`);
  }
}

async function ensureUniqueAttributeSlug(baseSlug: string, excludeId?: string): Promise<string> {
  const existingBase = await attributeRepository.findBySlug(baseSlug, excludeId);

  if (!existingBase) {
    return baseSlug;
  }

  for (let suffix = 2; suffix <= 1000; suffix += 1) {
    const candidate = withSlugSuffix(baseSlug, suffix);
    const existing = await attributeRepository.findBySlug(candidate, excludeId);

    if (!existing) {
      return candidate;
    }
  }

  throw new AppError(500, 'Unable to generate a unique attribute slug');
}

async function ensureUniqueValueLabel(
  attributeId: string,
  value: string,
  excludeId?: string,
): Promise<void> {
  const existing = await attributeRepository.findValueByValueInsensitive(
    attributeId,
    value,
    excludeId,
  );

  if (existing) {
    throw new AppError(409, `Attribute value "${value}" already exists`);
  }
}

async function ensureUniqueValueSlug(
  attributeId: string,
  baseSlug: string,
  excludeId?: string,
): Promise<string> {
  const existingBase = await attributeRepository.findValueBySlug(attributeId, baseSlug, excludeId);

  if (!existingBase) {
    return baseSlug;
  }

  for (let suffix = 2; suffix <= 1000; suffix += 1) {
    const candidate = withSlugSuffix(baseSlug, suffix);
    const existing = await attributeRepository.findValueBySlug(attributeId, candidate, excludeId);

    if (!existing) {
      return candidate;
    }
  }

  throw new AppError(500, 'Unable to generate a unique attribute value slug');
}

/**
 * Creates an attribute. Slug is generated server-side from the name.
 */
export async function createAttribute(input: CreateAttributeInput): Promise<Attribute> {
  await ensureUniqueAttributeName(input.name);

  const slug = await ensureUniqueAttributeSlug(slugFromLabel(input.name, 'attribute'));

  try {
    return toAttribute(await attributeRepository.create({ name: input.name, slug }));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(409, `Attribute name "${input.name}" already exists`);
    }

    throw error;
  }
}

export async function listAttributes(
  input: ListAttributesInput,
): Promise<{ attributes: Attribute[]; pagination: PaginationMeta }> {
  const filters = { search: input.search };

  const [records, total] = await Promise.all([
    attributeRepository.findMany(filters, input.page, input.limit),
    attributeRepository.count(filters),
  ]);

  return {
    attributes: records.map(toAttribute),
    pagination: buildPaginationMeta(input.page, input.limit, total),
  };
}

export async function getAttributeById(id: string): Promise<Attribute> {
  const attribute = await attributeRepository.findById(id);

  if (!attribute) {
    throw new NotFoundError(`Attribute with ID "${id}" not found`);
  }

  return toAttribute(attribute);
}

export async function updateAttribute(id: string, input: UpdateAttributeInput): Promise<Attribute> {
  const existing = await getAttributeById(id);
  const data: UpdateAttributeData = {};

  if (input.name !== undefined && input.name !== existing.name) {
    await ensureUniqueAttributeName(input.name, id);
    data.name = input.name;
    data.slug = await ensureUniqueAttributeSlug(slugFromLabel(input.name, 'attribute'), id);
  }

  try {
    return toAttribute(await attributeRepository.update(id, data));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(409, `Attribute name "${input.name ?? existing.name}" already exists`);
    }

    throw error;
  }
}

/**
 * Deletes an attribute. Values must be removed first because AttributeValue
 * references Attribute with ON DELETE RESTRICT. In-use values (variants/images)
 * must also be removed before the attribute can be deleted.
 */
export async function deleteAttribute(id: string): Promise<void> {
  await getAttributeById(id);

  const valueCount = await attributeRepository.countValues(id);

  if (valueCount > 0) {
    throw new AppError(
      409,
      'This attribute has values and cannot be deleted. Remove its values first.',
    );
  }

  try {
    await attributeRepository.remove(id);
  } catch (error) {
    if (isForeignKeyConstraintError(error)) {
      throw new AppError(409, 'This attribute is in use and cannot be deleted.');
    }

    throw error;
  }
}

export async function listAttributeValues(
  attributeId: string,
  input: ListAttributeValuesInput,
): Promise<{ values: AttributeValue[]; pagination: PaginationMeta }> {
  await getAttributeById(attributeId);

  const filters = { search: input.search };

  const [values, total] = await Promise.all([
    attributeRepository.findValues(attributeId, filters, input.page, input.limit),
    attributeRepository.countValues(attributeId, filters),
  ]);

  return {
    values,
    pagination: buildPaginationMeta(input.page, input.limit, total),
  };
}

export async function createAttributeValue(
  attributeId: string,
  input: CreateAttributeValueInput,
): Promise<AttributeValue> {
  await getAttributeById(attributeId);
  await ensureUniqueValueLabel(attributeId, input.value);

  const slug = await ensureUniqueValueSlug(attributeId, slugFromLabel(input.value, 'value'));

  try {
    return await attributeRepository.createValue({
      attributeId,
      value: input.value,
      slug,
      colorCode: input.colorCode ?? null,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(409, `Attribute value "${input.value}" already exists`);
    }

    throw error;
  }
}

export async function getAttributeValueById(
  attributeId: string,
  valueId: string,
): Promise<AttributeValue> {
  await getAttributeById(attributeId);

  const value = await attributeRepository.findValueById(attributeId, valueId);

  if (!value) {
    throw new NotFoundError(`Attribute value with ID "${valueId}" not found`);
  }

  return value;
}

export async function updateAttributeValue(
  attributeId: string,
  valueId: string,
  input: UpdateAttributeValueInput,
): Promise<AttributeValue> {
  const existing = await getAttributeValueById(attributeId, valueId);
  const data: UpdateAttributeValueData = {};

  if (input.value !== undefined && input.value !== existing.value) {
    await ensureUniqueValueLabel(attributeId, input.value, valueId);
    data.value = input.value;
    data.slug = await ensureUniqueValueSlug(
      attributeId,
      slugFromLabel(input.value, 'value'),
      valueId,
    );
  }

  if (input.colorCode !== undefined) {
    data.colorCode = input.colorCode;
  }

  try {
    return await attributeRepository.updateValue(valueId, data);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(409, `Attribute value "${input.value ?? existing.value}" already exists`);
    }

    throw error;
  }
}

/**
 * Deletes an attribute value. Rejected when product variants or product images reference it.
 */
export async function deleteAttributeValue(attributeId: string, valueId: string): Promise<void> {
  await getAttributeValueById(attributeId, valueId);

  const referenceCount = await attributeRepository.countValueReferences(valueId);

  if (referenceCount > 0) {
    throw new AppError(409, 'This attribute value is in use and cannot be deleted.');
  }

  try {
    await attributeRepository.removeValue(valueId);
  } catch (error) {
    if (isForeignKeyConstraintError(error)) {
      throw new AppError(409, 'This attribute value is in use and cannot be deleted.');
    }

    throw error;
  }
}
