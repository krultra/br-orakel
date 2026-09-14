export type AnswerBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'ordered'; items: string[] }
  | { kind: 'unordered'; items: string[] };

export function parseFormattedAnswer(text: string): AnswerBlock[] {
  const lines = text.replace(/\r/g, '').replace(/[ \t]+(?=(?:\d+\.|[-*•])\s)/g, '\n').split('\n').map((line) => line.trim());
  const blocks: AnswerBlock[] = [];
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line) {
      flushParagraph();
      index += 1;
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, ''));
        index += 1;
      }
      blocks.push({ kind: 'ordered', items });
      continue;
    }
    if (/^[-*•]\s+/.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (index < lines.length && /^[-*•]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*•]\s+/, ''));
        index += 1;
      }
      blocks.push({ kind: 'unordered', items });
      continue;
    }
    paragraph.push(line);
    index += 1;
  }
  flushParagraph();
  return blocks;
}
