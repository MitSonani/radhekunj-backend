export const API_VERSION = 'v1';
export const API_PREFIX = `/api/${API_VERSION}`;

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

export const ATTRIBUTE = {
  NAME_MAX: 100,
  VALUE_MAX: 100,
  SEARCH_MAX: 100,
  COLOR_CODE_PATTERN: /^#[0-9A-Fa-f]{6}$/,
} as const;

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const CATEGORY_IMAGE = {
  MAX_BYTES: 5 * 1024 * 1024,
  PRESIGNED_URL_EXPIRES_IN: 300,
  KEY_PREFIX: 'categories/',
  PURPOSE: 'category_image',
  ALLOWED_MIME_TYPES: ALLOWED_IMAGE_MIME_TYPES,
} as const;

export const PRODUCT = {
  NAME_MAX: 200,
  DESCRIPTION_MAX: 10000,
  SKU_MAX: 64,
  SEARCH_MAX: 100,
  ALT_TEXT_MAX: 255,
  COLOR_ATTRIBUTE_SLUG: 'color',
} as const;

export const PRODUCT_IMAGE = {
  MAX_BYTES: 5 * 1024 * 1024,
  PRESIGNED_URL_EXPIRES_IN: 300,
  KEY_PREFIX: 'products/',
  PURPOSE: 'product_image',
  ALLOWED_MIME_TYPES: ALLOWED_IMAGE_MIME_TYPES,
} as const;

export const ADDRESS = {
  FULL_NAME_MAX: 200,
  COUNTRY_CODE_MAX: 8,
  COUNTRY_CODE_PATTERN: /^\+[1-9]\d{0,3}$/,
  MOBILE_NUMBER_MIN: 4,
  MOBILE_NUMBER_MAX: 15,
  MOBILE_NUMBER_PATTERN: /^\d{4,15}$/,
  LINE_MAX: 255,
  CITY_MAX: 100,
  STATE_MAX: 100,
  POSTAL_CODE_MIN: 2,
  POSTAL_CODE_MAX: 20,
  POSTAL_CODE_PATTERN: /^[A-Za-z0-9][A-Za-z0-9 -]{0,18}[A-Za-z0-9]$/,
  COUNTRY_MAX: 100,
  LABEL_MAX: 50,
} as const;

export const OTP = {
  /** Minimum seconds a user must wait before requesting another OTP for the same identifier. */
  SEND_COOLDOWN_SECONDS: 60,
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;
