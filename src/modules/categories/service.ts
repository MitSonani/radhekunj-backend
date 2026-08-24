import { CategoryStatus, Prisma } from '@prisma/client';
import { AppError, NotFoundError, ValidationError } from '../../shared/errors/appError.js';
import { generateSlug, withSlugSuffix } from '../../shared/utils/slug.js';
import { buildPaginationMeta } from '../../shared/utils/pagination.js';
import {
  assertObjectExists,
  buildPublicUrl,
  createPresignedUploadUrl,
  deleteObjectIfExists,
  isManagedCategoryImageKey,
  type AllowedImageMimeType,
} from '../../shared/services/s3.js';
import * as categoryRepository from './repository.js';
import type { CategoryListFilters, CategoryRecord, UpdateCategoryData } from './repository.js';
import { PaginationMeta } from '../../shared/types/index.js';

export type CreateCategoryInput = {
  name: string;
  description?: string | null;
  status?: CategoryStatus;
  imageKey?: string;
};

export type UpdateCategoryInput = {
  name?: string;
  description?: string | null;
  status?: CategoryStatus;
  imageKey?: string | null;
};

export type ListCategoriesInput = {
  page: number;
  limit: number;
  search?: string;
  status?: CategoryStatus;
};

async function ensureUniqueName(name: string, excludeId?: string): Promise<void> {
  const existing = await categoryRepository.findByNameInsensitive(name, excludeId);

  if (existing) {
    throw new AppError(409, `Category name "${name}" already exists`);
  }
}

async function ensureUniqueSlug(baseSlug: string, excludeId?: string): Promise<string> {
  const existingBase = await categoryRepository.findBySlug(baseSlug, excludeId);

  if (!existingBase) {
    return baseSlug;
  }

  for (let suffix = 2; suffix <= 1000; suffix += 1) {
    const candidate = withSlugSuffix(baseSlug, suffix);
    const existing = await categoryRepository.findBySlug(candidate, excludeId);

    if (!existing) {
      return candidate;
    }
  }

  throw new AppError(500, 'Unable to generate a unique category slug');
}

function slugFromName(name: string): string {
  const slug = generateSlug(name);

  if (!slug) {
    throw new ValidationError('Category name must contain letters or numbers');
  }

  return slug;
}

async function resolveImageFields(imageKey: string | null | undefined): Promise<{
  imageKey: string | null;
  imageUrl: string | null;
}> {
  if (!imageKey) {
    return { imageKey: null, imageUrl: null };
  }

  if (!isManagedCategoryImageKey(imageKey)) {
    throw new AppError(400, 'Invalid image key');
  }

  await assertObjectExists(imageKey);

  return {
    imageKey,
    imageUrl: buildPublicUrl(imageKey),
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Creates a category. Slug is generated server-side from the name.
 */
export async function createCategory(input: CreateCategoryInput): Promise<CategoryRecord> {
  await ensureUniqueName(input.name);

  const slug = await ensureUniqueSlug(slugFromName(input.name));
  const image = await resolveImageFields(input.imageKey);

  try {
    return await categoryRepository.create({
      name: input.name,
      slug,
      description: input.description ?? null,
      status: input.status,
      imageKey: image.imageKey,
      imageUrl: image.imageUrl,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(409, `Category name "${input.name}" already exists`);
    }

    throw error;
  }
}

/**
 * Lists categories with pagination, optional search, and status filter.
 */
export async function listCategories(
  input: ListCategoriesInput,
): Promise<{ categories: CategoryRecord[]; pagination: PaginationMeta }> {
  const filters: CategoryListFilters = {
    search: input.search,
    status: input.status,
  };

  const [categories, total] = await Promise.all([
    categoryRepository.findMany(filters, input.page, input.limit),
    categoryRepository.count(filters),
  ]);

  return {
    categories,
    pagination: buildPaginationMeta(input.page, input.limit, total),
  };
}

/**
 * Retrieves a category by ID.
 */
export async function getCategoryById(id: string): Promise<CategoryRecord> {
  const category = await categoryRepository.findById(id);

  if (!category) {
    throw new NotFoundError(`Category with ID "${id}" not found`);
  }

  return category;
}

/**
 * Updates allowed category fields. Replacing an image stores the new S3 reference first, then deletes the old object.
 */
export async function updateCategory(
  id: string,
  input: UpdateCategoryInput,
): Promise<CategoryRecord> {
  const existing = await getCategoryById(id);
  const data: UpdateCategoryData = {};

  if (input.name !== undefined && input.name !== existing.name) {
    await ensureUniqueName(input.name, id);
    data.name = input.name;
    data.slug = await ensureUniqueSlug(slugFromName(input.name), id);
  }

  if (input.description !== undefined) {
    data.description = input.description;
  }

  if (input.status !== undefined) {
    data.status = input.status;
  }

  let previousImageKey: string | null = null;

  if (input.imageKey !== undefined) {
    const nextImage = await resolveImageFields(input.imageKey);

    if (existing.imageKey && existing.imageKey !== nextImage.imageKey) {
      previousImageKey = existing.imageKey;
    }

    data.imageKey = nextImage.imageKey;
    data.imageUrl = nextImage.imageUrl;
  }

  let updated: CategoryRecord;

  try {
    updated = await categoryRepository.update(id, data);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(409, `Category name "${input.name ?? existing.name}" already exists`);
    }

    throw error;
  }

  if (previousImageKey) {
    await deleteObjectIfExists(previousImageKey);
  }

  return updated;
}

/**
 * Deletes a category. Product references are not modeled yet; once they exist, deletion must be rejected if products remain.
 */
export async function deleteCategory(id: string): Promise<void> {
  const existing = await getCategoryById(id);

  await categoryRepository.remove(id);
  await deleteObjectIfExists(existing.imageKey);
}

/**
 * Generates a presigned S3 POST for a category image.
 */
export async function createCategoryImageUploadUrl(input: {
  contentType: AllowedImageMimeType;
  fileSize: number;
}) {
  return createPresignedUploadUrl(input);
}
