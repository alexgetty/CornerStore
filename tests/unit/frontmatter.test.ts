import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../../src/lib/frontmatter.js';

describe('parseFrontmatter', () => {
  it('parses valid frontmatter with data and content', () => {
    const result = parseFrontmatter('---\ntitle: Hello\n---\nBody text\n');
    expect(result.data).toEqual({ title: 'Hello' });
    expect(result.content).toBe('Body text\n');
  });

  it('parses multiple frontmatter fields', () => {
    const result = parseFrontmatter('---\ntitle: Hello\ndescription: A page\n---\nBody\n');
    expect(result.data).toEqual({ title: 'Hello', description: 'A page' });
    expect(result.content).toBe('Body\n');
  });

  it('returns empty data and full content when no frontmatter present', () => {
    const result = parseFrontmatter('Just plain text\n');
    expect(result.data).toEqual({});
    expect(result.content).toBe('Just plain text\n');
  });

  it('returns empty data and full content for empty string', () => {
    const result = parseFrontmatter('');
    expect(result.data).toEqual({});
    expect(result.content).toBe('');
  });

  it('handles empty frontmatter block', () => {
    const result = parseFrontmatter('---\n---\nContent after empty frontmatter\n');
    expect(result.data).toEqual({});
    expect(result.content).toBe('Content after empty frontmatter\n');
  });

  it('handles empty frontmatter with no trailing content', () => {
    const result = parseFrontmatter('---\n---\n');
    expect(result.data).toEqual({});
    expect(result.content).toBe('');
  });

  it('handles frontmatter with no trailing newline after closing delimiter', () => {
    const result = parseFrontmatter('---\ntitle: Hi\n---');
    expect(result.data).toEqual({ title: 'Hi' });
    expect(result.content).toBe('');
  });

  it('returns empty data when no closing delimiter found', () => {
    const result = parseFrontmatter('---\ntitle: Hello\nno closing\n');
    expect(result.data).toEqual({});
    expect(result.content).toBe('---\ntitle: Hello\nno closing\n');
  });

  it('returns empty data when file is just opening delimiter', () => {
    const result = parseFrontmatter('---\n');
    expect(result.data).toEqual({});
    expect(result.content).toBe('---\n');
  });

  it('returns empty data when file is just dashes with no newline', () => {
    const result = parseFrontmatter('---');
    expect(result.data).toEqual({});
    expect(result.content).toBe('---');
  });

  it('does not treat --- mid-content as frontmatter', () => {
    const result = parseFrontmatter('Some text\n---\ntitle: Not frontmatter\n---\n');
    expect(result.data).toEqual({});
    expect(result.content).toBe('Some text\n---\ntitle: Not frontmatter\n---\n');
  });

  it('handles nested YAML objects', () => {
    const raw = '---\nimage_alts:\n  img1.jpg: Primary\n  img2.jpg: Side view\n---\n';
    const result = parseFrontmatter(raw);
    expect(result.data).toEqual({
      image_alts: { 'img1.jpg': 'Primary', 'img2.jpg': 'Side view' },
    });
  });

  it('normalizes Windows line endings', () => {
    const result = parseFrontmatter('---\r\ntitle: Hello\r\n---\r\nBody\r\n');
    expect(result.data).toEqual({ title: 'Hello' });
    expect(result.content).toBe('Body\n');
  });

  it('throws on malformed YAML', () => {
    expect(() => parseFrontmatter('---\ntitle: [\n---\n')).toThrow();
  });

  it('returns empty data when YAML parses to a scalar', () => {
    const result = parseFrontmatter('---\njust a string\n---\nContent\n');
    expect(result.data).toEqual({});
    expect(result.content).toBe('Content\n');
  });

  it('returns empty data when YAML parses to an array', () => {
    const result = parseFrontmatter('---\n- item1\n- item2\n---\nContent\n');
    expect(result.data).toEqual({});
    expect(result.content).toBe('Content\n');
  });

  it('returns empty data when YAML parses to null', () => {
    const result = parseFrontmatter('---\nnull\n---\nContent\n');
    expect(result.data).toEqual({});
    expect(result.content).toBe('Content\n');
  });

  it('only splits on first closing delimiter', () => {
    const result = parseFrontmatter('---\ntitle: Hi\n---\nContent\n---\nMore\n');
    expect(result.data).toEqual({ title: 'Hi' });
    expect(result.content).toBe('Content\n---\nMore\n');
  });
});
