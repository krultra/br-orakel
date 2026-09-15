/**
 * Removes the most obvious organization and contact identifiers before a
 * user-consented los answer is offered as a community FAQ candidate.
 * This is a demo safeguard, not a complete anonymization service.
 */
export function redactCommunityText(value: string, identifiers: string[]): string {
  let redacted = value;
  for (const identifier of identifiers.filter((item) => item.trim().length > 2).sort((left, right) => right.length - left.length)) {
    redacted = redacted.split(identifier).join('[fjernet]');
  }
  return redacted
    .replace(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[e-post fjernet]')
    .replace(/(?:\+47\s?)?\b\d{8}\b/g, '[telefonnummer fjernet]')
    .trim()
    .slice(0, 12000);
}

