import type { ObligationConceptLink } from '../domain/types.js';

export type TextPart = { text: string; link?: ObligationConceptLink };

/** Splits only explicitly curated terms; arbitrary text is never auto-labelled. */
export function splitConceptText(text: string, links: ObligationConceptLink[]): TextPart[] {
  const activeLinks = links.filter((link) => link.label.trim());
  if (activeLinks.length === 0) return [{ text }];
  const pattern = activeLinks
    .map((link) => link.label.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((left, right) => right.length - left.length)
    .join('|');
  const matcher = new RegExp(`(${pattern})`, 'giu');
  const parts: TextPart[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(matcher)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push({ text: text.slice(lastIndex, index) });
    const matched = match[0];
    const link = activeLinks.find((candidate) => candidate.label.toLocaleLowerCase('nb-NO') === matched.toLocaleLowerCase('nb-NO'));
    parts.push(link ? { text: matched, link } : { text: matched });
    lastIndex = index + matched.length;
  }
  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex) });
  return parts.length > 0 ? parts : [{ text }];
}

export function normalizeConceptSelection(value: string) {
  return value.replace(/\s+/g, ' ').trim().replace(/[.,;:!?]+$/g, '').trim().slice(0, 80);
}
