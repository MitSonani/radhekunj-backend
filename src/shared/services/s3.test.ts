import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import {
  assertObjectExists,
  createPresignedUploadUrl,
  isManagedCategoryImageKey,
  isManagedProductImageKey,
  parseProductImageKey,
} from './s3.js';
import { HTTP_STATUS } from '../constants/index.js';
import { AppError } from '../errors/appError.js';

vi.mock('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: vi.fn(),
}));

const VALID_IMAGE_KEY =
  'categories/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg';
const PRODUCT_ID = '11111111-1111-1111-1111-111111111111';
const COLOR_VALUE_ID = '22222222-2222-2222-2222-222222222222';
const FILE_ID = '33333333-3333-3333-3333-333333333333';
const GENERIC_PRODUCT_KEY = `products/${PRODUCT_ID}/${FILE_ID}.jpg`;
const COLOR_PRODUCT_KEY = `products/${PRODUCT_ID}/colors/${COLOR_VALUE_ID}/${FILE_ID}.webp`;

describe('isManagedCategoryImageKey', () => {
  it('accepts server-generated category object keys', () => {
    expect(isManagedCategoryImageKey(VALID_IMAGE_KEY)).toBe(true);
  });

  it('rejects client-controlled or unsafe keys', () => {
    expect(isManagedCategoryImageKey('categories/photo.jpg')).toBe(false);
    expect(isManagedCategoryImageKey('categories/../secrets.txt')).toBe(false);
    expect(isManagedCategoryImageKey(GENERIC_PRODUCT_KEY)).toBe(false);
  });
});

describe('isManagedProductImageKey', () => {
  it('accepts generic and color-specific product object keys', () => {
    expect(isManagedProductImageKey(GENERIC_PRODUCT_KEY)).toBe(true);
    expect(isManagedProductImageKey(COLOR_PRODUCT_KEY)).toBe(true);
  });

  it('rejects unmanaged product keys', () => {
    expect(isManagedProductImageKey('products/photo.jpg')).toBe(false);
    expect(isManagedProductImageKey(`products/${PRODUCT_ID}/../secrets.txt`)).toBe(false);
  });
});

describe('parseProductImageKey', () => {
  it('extracts product and optional color identifiers', () => {
    expect(parseProductImageKey(GENERIC_PRODUCT_KEY)).toEqual({ productId: PRODUCT_ID });
    expect(parseProductImageKey(COLOR_PRODUCT_KEY)).toEqual({
      productId: PRODUCT_ID,
      attributeValueId: COLOR_VALUE_ID,
    });
  });
});

describe('createPresignedUploadUrl', () => {
  beforeEach(() => {
    vi.mocked(createPresignedPost).mockResolvedValue({
      url: 'https://test-bucket.s3.ap-south-1.amazonaws.com',
      fields: {
        key: VALID_IMAGE_KEY,
        'Content-Type': 'image/jpeg',
        Policy: 'policy',
        'X-Amz-Signature': 'signature',
      },
    });
  });

  it('returns a presigned POST payload with a generated object key', async () => {
    const result = await createPresignedUploadUrl({
      contentType: 'image/jpeg',
      fileSize: 1024,
    });

    expect(result.method).toBe('POST');
    expect(result.uploadUrl).toBe('https://test-bucket.s3.ap-south-1.amazonaws.com');
    expect(result.imageKey).toMatch(/^categories\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/);
    expect(result.expiresIn).toBe(300);
    expect(result.maxSizeBytes).toBe(1024);
    expect(createPresignedPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        Conditions: [
          ['content-length-range', 1, 1024],
          ['eq', '$Content-Type', 'image/jpeg'],
        ],
      }),
    );
  });

  it('uses a supplied product object key', async () => {
    const result = await createPresignedUploadUrl({
      contentType: 'image/webp',
      fileSize: 2048,
      objectKey: COLOR_PRODUCT_KEY,
    });

    expect(result.imageKey).toBe(COLOR_PRODUCT_KEY);
    expect(createPresignedPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        Key: COLOR_PRODUCT_KEY,
      }),
    );
  });
});

describe('assertObjectExists', () => {
  it('rejects unmanaged image keys before calling S3', async () => {
    await expect(assertObjectExists('categories/photo.jpg')).rejects.toMatchObject({
      statusCode: HTTP_STATUS.BAD_REQUEST,
      message: 'Invalid image key',
    } satisfies Partial<AppError>);
  });
});
