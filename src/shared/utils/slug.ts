const MAX_SLUG_LENGTH = 120;

/**
 * Converts a display name into a URL-friendly slug.
 *
 * Example: "Men's Shoes" → "mens-shoes"
 */
export function generateSlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH);
}

/**
 * Appends a numeric suffix while staying within the slug length limit.
 */
export function withSlugSuffix(baseSlug: string, suffix: number): string {
  const suffixPart = `-${suffix}`;
  const truncatedBase = baseSlug.slice(0, MAX_SLUG_LENGTH - suffixPart.length);
  return `${truncatedBase}${suffixPart}`;
}
