import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { appConfig } from '../../config/index.js';
import { AppError } from '../errors/appError.js';
import { ALLOWED_IMAGE_MIME_TYPES, CATEGORY_IMAGE, PRODUCT_IMAGE } from '../constants/index.js';
import { logger } from '../utils/logger.js';

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export type PresignedUploadResult = {
  uploadUrl: string;
  method: 'POST';
  fields: Record<string, string>;
  imageKey: string;
  imageUrl: string;
  expiresIn: number;
  maxSizeBytes: number;
};

export type ParsedProductImageKey = {
  productId: string;
  attributeValueId?: string;
};

const MIME_TO_EXTENSION: Record<AllowedImageMimeType, 'jpg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

const CATEGORY_IMAGE_KEY_PATTERN = new RegExp(
  `^categories/${UUID_PATTERN}/${UUID_PATTERN}\\.(jpg|png|webp)$`,
);

const PRODUCT_GENERIC_IMAGE_KEY_PATTERN = new RegExp(
  `^products/(${UUID_PATTERN})/(${UUID_PATTERN})\\.(jpg|png|webp)$`,
);

const PRODUCT_COLOR_IMAGE_KEY_PATTERN = new RegExp(
  `^products/(${UUID_PATTERN})/colors/(${UUID_PATTERN})/(${UUID_PATTERN})\\.(jpg|png|webp)$`,
);

type ResolvedS3Config = {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl?: string;
};

let s3Client: S3Client | undefined;

function getS3Config(): ResolvedS3Config {
  const { region, accessKeyId, secretAccessKey, bucket, publicBaseUrl } = appConfig.s3;

  if (!region || !accessKeyId || !secretAccessKey || !bucket) {
    throw new AppError(500, 'File storage is not configured');
  }

  return { region, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

function isS3NotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate.name === 'NotFound' || candidate.$metadata?.httpStatusCode === 404;
}

function getS3Client(): S3Client {
  if (!s3Client) {
    const config = getS3Config();
    s3Client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  return s3Client;
}

export function isManagedCategoryImageKey(key: string): boolean {
  return CATEGORY_IMAGE_KEY_PATTERN.test(key);
}

export function parseProductImageKey(key: string): ParsedProductImageKey | null {
  const colorMatch = PRODUCT_COLOR_IMAGE_KEY_PATTERN.exec(key);

  if (colorMatch?.[1] && colorMatch[2]) {
    return {
      productId: colorMatch[1],
      attributeValueId: colorMatch[2],
    };
  }

  const genericMatch = PRODUCT_GENERIC_IMAGE_KEY_PATTERN.exec(key);

  if (genericMatch?.[1]) {
    return { productId: genericMatch[1] };
  }

  return null;
}

export function isManagedProductImageKey(key: string): boolean {
  return parseProductImageKey(key) !== null;
}

export function isManagedImageKey(key: string): boolean {
  return isManagedCategoryImageKey(key) || isManagedProductImageKey(key);
}

export function buildPublicUrl(imageKey: string): string {
  const { region, accessKeyId, secretAccessKey, bucket, publicBaseUrl } = appConfig.s3;

  // When S3 is fully configured, return the real URL.
  if (region && accessKeyId && secretAccessKey && bucket) {
    if (publicBaseUrl) {
      return `${publicBaseUrl.replace(/\/$/, '')}/${imageKey}`;
    }
    return `https://${bucket}.s3.${region}.amazonaws.com/${imageKey}`;
  }

  // S3 not configured (development) — return a deterministic picsum placeholder
  // so the catalog API still works without real file storage.
  const seed = imageKey.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16) || 'placeholder';
  return `https://picsum.photos/seed/${seed}/800/1067`;
}

function buildCategoryImageKey(contentType: AllowedImageMimeType): string {
  const extension = MIME_TO_EXTENSION[contentType];
  return `${CATEGORY_IMAGE.KEY_PREFIX}${randomUUID()}/${randomUUID()}.${extension}`;
}

export function buildProductImageKey(
  productId: string,
  contentType: AllowedImageMimeType,
  attributeValueId?: string,
): string {
  const extension = MIME_TO_EXTENSION[contentType];
  const fileName = `${randomUUID()}.${extension}`;

  if (attributeValueId) {
    return `${PRODUCT_IMAGE.KEY_PREFIX}${productId}/colors/${attributeValueId}/${fileName}`;
  }

  return `${PRODUCT_IMAGE.KEY_PREFIX}${productId}/${fileName}`;
}

/**
 * Creates a presigned POST that the Admin Panel uses to upload directly to S3.
 * Object keys are generated server-side. File size is enforced by S3 via content-length-range.
 */
export async function createPresignedUploadUrl(input: {
  contentType: AllowedImageMimeType;
  fileSize: number;
  objectKey?: string;
  expiresIn?: number;
}): Promise<PresignedUploadResult> {
  const config = getS3Config();
  const imageKey = input.objectKey ?? buildCategoryImageKey(input.contentType);
  const expiresIn = input.expiresIn ?? CATEGORY_IMAGE.PRESIGNED_URL_EXPIRES_IN;

  try {
    const { url, fields } = await createPresignedPost(getS3Client(), {
      Bucket: config.bucket,
      Key: imageKey,
      Conditions: [
        ['content-length-range', 1, input.fileSize],
        ['eq', '$Content-Type', input.contentType],
      ],
      Fields: {
        'Content-Type': input.contentType,
      },
      Expires: expiresIn,
    });

    return {
      uploadUrl: url,
      method: 'POST',
      fields,
      imageKey,
      imageUrl: buildPublicUrl(imageKey),
      expiresIn,
      maxSizeBytes: input.fileSize,
    };
  } catch (error) {
    logger.error('Failed to create S3 presigned upload URL', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AppError(500, 'Failed to generate image upload URL', { cause: error });
  }
}

/**
 * Verifies that a previously issued object key actually exists in S3.
 */
export async function assertObjectExists(imageKey: string): Promise<void> {
  if (!isManagedImageKey(imageKey)) {
    throw new AppError(400, 'Invalid image key');
  }

  try {
    await getS3Client().send(
      new HeadObjectCommand({
        Bucket: getS3Config().bucket,
        Key: imageKey,
      }),
    );
  } catch (error) {
    if (isS3NotFoundError(error)) {
      throw new AppError(400, 'Uploaded image was not found. Upload the image before saving.');
    }

    logger.error('Failed to verify S3 object', {
      imageKey,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AppError(500, 'Failed to verify uploaded image', { cause: error });
  }
}

/**
 * Deletes a managed S3 object. Unmanaged keys are ignored.
 * Failures are logged and not rethrown so a successful database write is not rolled back by S3.
 */
export async function deleteObjectIfExists(imageKey: string | null | undefined): Promise<void> {
  if (!imageKey) {
    return;
  }

  if (!isManagedImageKey(imageKey)) {
    logger.warn('Refusing to delete unmanaged S3 object', { imageKey });
    return;
  }

  try {
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: getS3Config().bucket,
        Key: imageKey,
      }),
    );
  } catch (error) {
    logger.warn('Failed to delete S3 object', {
      imageKey,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
