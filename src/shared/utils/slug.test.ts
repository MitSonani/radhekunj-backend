import { describe, it, expect } from 'vitest';
import { generateSlug, withSlugSuffix } from './slug.js';

describe('generateSlug', () => {
  it('converts a category name into a URL-friendly slug', () => {
    expect(generateSlug("Men's Shoes")).toBe('mens-shoes');
  });

  it('normalizes whitespace, case, and punctuation', () => {
    expect(generateSlug('  Hello   World!! ')).toBe('hello-world');
  });

  it('strips diacritics', () => {
    expect(generateSlug('Café')).toBe('cafe');
  });

  it('returns an empty string when no alphanumeric characters remain', () => {
    expect(generateSlug('***')).toBe('');
  });
});

describe('withSlugSuffix', () => {
  it('appends a numeric suffix', () => {
    expect(withSlugSuffix('mens-shoes', 2)).toBe('mens-shoes-2');
  });
});
