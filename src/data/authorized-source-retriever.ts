import type { KnowledgeContextItem } from '../domain/adapters.js';
import type { Source } from '../domain/types.js';
import { isAuthorizedSourceUrl } from './authorized-sources.js';

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface AuthorizedSourceRetrieverOptions {
  fetcher?: Fetcher;
  timeoutMs?: number;
  maxSources?: number;
  maxBytesPerSource?: number;
  maxCharsPerSource?: number;
}

export class SourceRetrievalError extends Error {
  constructor(message: string, public readonly url: string) {
    super(message);
    this.name = 'SourceRetrievalError';
  }
}

function tokens(value: string): string[] {
  return value.toLocaleLowerCase('nb-NO').split(/[^\p{L}\p{N}]+/u).filter((item) => item.length >= 3);
}

/** Selects a small, deterministic set before any network call is made. */
export function selectSourceCandidates(question: string, sources: Source[], maxSources = 2): Source[] {
  const queryTokens = tokens(question);
  return sources
    .filter((source) => isAuthorizedSourceUrl(source.url) && source.sourceType !== 'dataset')
    .map((source) => {
      const searchable = tokens(`${source.title} ${source.relevantExcerpt}`).filter((token) => queryTokens.includes(token));
      const score = searchable.length * 10 + (source.authority === 'AUTHORITATIVE' ? 2 : 1);
      return { source, score };
    })
    .sort((left, right) => right.score - left.score || left.source.title.localeCompare(right.source.title, 'nb'))
    .slice(0, Math.max(0, maxSources))
    .map((item) => item.source);
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return (await response.text()).slice(0, maxBytes);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const next = await reader.read();
      if (next.done) break;
      const remaining = maxBytes - total;
      const chunk = next.value.length > remaining ? next.value.slice(0, remaining) : next.value;
      chunks.push(chunk);
      total += chunk.length;
      if (chunk.length < next.value.length) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(result);
}

function toPlainText(value: string, maxChars: number): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

export class AuthorizedSourceRetriever {
  private readonly fetcher: Fetcher;
  private readonly timeoutMs: number;
  private readonly maxSources: number;
  private readonly maxBytesPerSource: number;
  private readonly maxCharsPerSource: number;

  constructor(options: AuthorizedSourceRetrieverOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = Math.max(250, options.timeoutMs ?? 2500);
    this.maxSources = Math.max(0, Math.min(5, options.maxSources ?? 2));
    this.maxBytesPerSource = Math.max(1024, options.maxBytesPerSource ?? 500_000);
    this.maxCharsPerSource = Math.max(500, options.maxCharsPerSource ?? 8_000);
  }

  async retrieve(question: string, sources: Source[]): Promise<KnowledgeContextItem[]> {
    const candidates = selectSourceCandidates(question, sources, this.maxSources);
    const results = await Promise.all(candidates.map((source) => this.retrieveOne(source)));
    return results.filter((item): item is KnowledgeContextItem => Boolean(item));
  }

  private async retrieveOne(source: Source): Promise<KnowledgeContextItem | null> {
    if (!isAuthorizedSourceUrl(source.url)) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(source.url, { headers: { Accept: 'text/html, application/xhtml+xml, application/json, text/plain' }, signal: controller.signal });
      if (!response.ok) throw new SourceRetrievalError(`Kilden svarte med HTTP ${response.status}.`, source.url);
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType && !/(text\/|application\/json|application\/xhtml\+xml)/i.test(contentType)) return null;
      const text = toPlainText(await readLimitedText(response, this.maxBytesPerSource), this.maxCharsPerSource);
      if (!text) return null;
      return { id: `retrieved-${source.id}`, title: source.title, text, trustLevel: source.officiality, sourceId: source.id };
    } catch (error) {
      if (error instanceof SourceRetrievalError) return null;
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
