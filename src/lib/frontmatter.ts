import { load } from 'js-yaml';

export function parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
  const str = raw.replace(/\r\n/g, '\n');

  if (!str.startsWith('---\n')) {
    return { data: {}, content: str };
  }

  const closingIndex = str.indexOf('\n---', 3);
  if (closingIndex === -1) {
    return { data: {}, content: str };
  }

  const yamlStr = str.slice(4, closingIndex);

  let contentStart = closingIndex + 4;
  if (str[contentStart] === '\n') contentStart++;
  const content = str.slice(contentStart);

  const parsed = load(yamlStr);
  const data =
    parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};

  return { data, content };
}
