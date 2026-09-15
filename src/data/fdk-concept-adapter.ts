import type { ConceptAdapter } from '../domain/adapters.js';
import type { Concept } from '../domain/types.js';

const DEFAULT_SEARCH_URL = 'https://search.api.fellesdatakatalog.digdir.no/search';
const DEFAULT_RESOURCE_URL = 'https://resource.api.fellesdatakatalog.digdir.no/v1';

type JsonRecord = Record<string, unknown>;
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface FdkConceptAdapterOptions {
  searchUrl?: string;
  resourceUrl?: string;
  fetcher?: Fetcher;
  timeoutMs?: number;
}

export class FdkConceptError extends Error {
  constructor(message: string, public readonly url: string, public readonly status?: number) {
    super(message);
    this.name = 'FdkConceptError';
  }
}

const isRecord = (value: unknown): value is JsonRecord => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const records = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.filter(isRecord) : [];
const localized = (value: unknown): string | undefined => {
  if (!isRecord(value)) return undefined;
  return text(value.nb) ?? text(value.no) ?? text(value.nn) ?? text(value.en);
};
const unique = (values: Array<string | undefined>): string[] => [...new Set(values.filter((value): value is string => Boolean(value)))];

const publisherFrom = (raw: JsonRecord): { name: string; orgNumber?: string } => {
  const publisher = isRecord(raw.publisher) ? raw.publisher : isRecord(raw.organization) ? raw.organization : {};
  return {
    name: text(publisher.name) ?? localized(publisher.prefLabel) ?? 'Ukjent utgiver',
    orgNumber: text(publisher.id),
  };
};

const relationValues = (value: unknown): Array<{ uri: string; relation: string }> => records(value).flatMap((relation) => {
  const relationName = text(relation.type) ?? text(relation.relation) ?? Object.keys(relation).find((key) => key !== 'uri');
  const uri = text(relation.uri) ?? (relationName ? text(relation[relationName]) : undefined);
  return uri && relationName ? [{ uri, relation: relationName }] : [];
});

function mapConcept(raw: JsonRecord, retrievedAt = new Date().toISOString()): Concept | null {
  const id = text(raw.id);
  const uri = text(raw.uri) ?? text(raw.identifier);
  const title = localized(raw.title) ?? localized(raw.prefLabel);
  if (!id || !uri || !title) return null;
  const publisher = publisherFrom(raw);
  const definition = localized(raw.description) ?? (isRecord(raw.definition) ? localized(raw.definition.text) : undefined);
  const alternativeTerms = records(raw.additionalTitles).map(localized).filter((value): value is string => Boolean(value));
  const status = localized(raw.status);
  return {
    id,
    uri,
    term: title,
    alternativeTerms: unique(alternativeTerms),
    ...(definition ? { definition } : {}),
    publisher: publisher.name,
    ...(publisher.orgNumber ? { publisherOrgNumber: publisher.orgNumber } : {}),
    ...(status ? { status } : {}),
    ...(localized(raw.subject) ? { subject: localized(raw.subject) } : {}),
    relatedConcepts: relationValues(raw.relations).concat(relationValues(raw.genericRelation)),
    sourceUrl: uri,
    trustLevel: 'OFFICIAL_GUIDANCE',
    retrievedAt,
  };
}

export class FdkConceptAdapter implements ConceptAdapter {
  private readonly searchUrl: string;
  private readonly resourceUrl: string;
  private readonly fetcher: Fetcher;
  private readonly timeoutMs: number;

  constructor(options: FdkConceptAdapterOptions = {}) {
    this.searchUrl = options.searchUrl ?? DEFAULT_SEARCH_URL;
    this.resourceUrl = (options.resourceUrl ?? DEFAULT_RESOURCE_URL).replace(/\/+$/, '');
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = Math.max(250, options.timeoutMs ?? 5000);
  }

  async search(query: string, limit = 10): Promise<Concept[]> {
    const normalizedQuery = query.trim().slice(0, 180);
    if (!normalizedQuery) return [];
    const url = this.searchUrl;
    const payload = await this.requestJson(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: normalizedQuery, page: 0, size: Math.max(1, Math.min(limit, 20)) }),
    });
    if (!isRecord(payload) || !Array.isArray(payload.hits)) throw new FdkConceptError('Felles datakatalog svarte uten treffliste.', url);
    const retrievedAt = new Date().toISOString();
    return records(payload.hits).map((item) => mapConcept(item, retrievedAt)).filter((item): item is Concept => Boolean(item)).slice(0, Math.max(1, Math.min(limit, 20)));
  }

  async getById(id: string): Promise<Concept | null> {
    const normalizedId = id.trim();
    if (!normalizedId || !/^[a-z0-9-]+$/i.test(normalizedId)) return null;
    const url = `${this.resourceUrl}/concepts/${encodeURIComponent(normalizedId)}`;
    const payload = await this.requestJson(url, { headers: { Accept: 'application/json' } }, true);
    return payload && isRecord(payload) ? mapConcept(payload) : null;
  }

  async getByUri(uri: string): Promise<Concept | null> {
    const normalizedUri = uri.trim();
    if (!normalizedUri) return null;
    const url = new URL(`${this.resourceUrl}/concepts/by-uri`);
    url.searchParams.set('uri', normalizedUri);
    const payload = await this.requestJson(url.toString(), { headers: { Accept: 'application/json' } }, true);
    return payload && isRecord(payload) ? mapConcept(payload) : null;
  }

  private async requestJson(url: string, init: RequestInit, allowNotFound = false): Promise<unknown | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(url, { ...init, signal: controller.signal });
      if (allowNotFound && (response.status === 404 || response.status === 410)) return null;
      if (!response.ok) throw new FdkConceptError(`Felles datakatalog svarte med HTTP ${response.status}.`, url, response.status);
      return await response.json();
    } catch (error) {
      if (error instanceof FdkConceptError) throw error;
      if (error instanceof Error && error.name === 'AbortError') throw new FdkConceptError(`Tidsavbrudd mot Felles datakatalog etter ${this.timeoutMs} ms.`, url);
      throw new FdkConceptError(`Kunne ikke lese Felles datakatalog: ${error instanceof Error ? error.message : 'ukjent feil'}.`, url);
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Keeps the demo useful when a public catalog is temporarily unavailable. */
export class FallbackConceptAdapter implements ConceptAdapter {
  constructor(private readonly primary: ConceptAdapter, private readonly fallback: ConceptAdapter) {}

  async search(query: string, limit?: number): Promise<Concept[]> {
    try {
      return await this.primary.search(query, limit);
    } catch {
      return this.fallback.search(query, limit);
    }
  }

  async getById(id: string): Promise<Concept | null> {
    try {
      return await this.primary.getById(id) ?? this.fallback.getById(id);
    } catch {
      return this.fallback.getById(id);
    }
  }

  async getByUri(uri: string): Promise<Concept | null> {
    try {
      return await this.primary.getByUri(uri) ?? this.fallback.getByUri(uri);
    } catch {
      return this.fallback.getByUri(uri);
    }
  }
}
