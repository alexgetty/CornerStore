import { describe, it, expect } from 'vitest';
import { slugify } from '../../../src/lib/storefront/slugify.js';

describe('slugify', () => {
  it('lowercases input', () => {
    expect(slugify('Shirts')).toBe('shirts');
  });

  it('replaces spaces with hyphens', () => {
    expect(slugify('Home Garden')).toBe('home-garden');
  });

  it('replaces ampersands and special characters with hyphens', () => {
    expect(slugify('Home & Garden')).toBe('home-garden');
  });

  it('collapses consecutive non-alphanumeric characters into one hyphen', () => {
    expect(slugify('Home & & Garden')).toBe('home-garden');
  });

  it('trims leading non-alphanumeric characters', () => {
    expect(slugify('&Shirts')).toBe('shirts');
  });

  it('trims trailing non-alphanumeric characters', () => {
    expect(slugify('Shirts&')).toBe('shirts');
  });

  it('strips diacritics from accented characters', () => {
    expect(slugify('Café Supplies')).toBe('cafe-supplies');
  });

  it('passes through already-slugified input unchanged', () => {
    expect(slugify('t-shirts')).toBe('t-shirts');
  });

  it('preserves internal hyphens', () => {
    expect(slugify('T-Shirts')).toBe('t-shirts');
  });

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });

  it('returns empty string for only special characters', () => {
    expect(slugify('&&&')).toBe('');
  });

  it('handles numeric input', () => {
    expect(slugify('Category 1')).toBe('category-1');
  });
});
