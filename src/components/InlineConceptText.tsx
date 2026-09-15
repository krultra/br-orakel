import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import { api } from '../api';
import type { Concept, ObligationConceptLink } from '../domain/types';

type TextPart = { text: string; link?: ObligationConceptLink };

/**
 * Splits only explicitly curated terms. This deliberately does not infer
 * concepts from arbitrary words in official text.
 */
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
    if (link) parts.push({ text: matched, link });
    else parts.push({ text: matched });
    lastIndex = index + matched.length;
  }
  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex) });
  return parts.length > 0 ? parts : [{ text }];
}

function ConceptTrust({ concept }: { concept: Concept }) {
  const label = concept.trustLevel === 'OFFICIAL_GUIDANCE' ? 'Offisiell veiledning' : 'Under vurdering';
  return <span className={`concept-popover-trust trust-${concept.trustLevel.toLowerCase()}`}><ShieldCheck size={13} /> {label}</span>;
}

export function InlineConceptText({ text, links }: { text: string; links?: ObligationConceptLink[] }) {
  const parts = useMemo(() => splitConceptText(text, links ?? []), [links, text]);
  const [activeLink, setActiveLink] = useState<ObligationConceptLink | null>(null);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setActiveLink(null);
    setConcepts([]);
    setError('');
  }, [text, links]);

  const openConcept = async (link: ObligationConceptLink) => {
    setActiveLink(link);
    setConcepts([]);
    setError('');
    setLoading(true);
    try {
      const results = await api.concepts(link.query, 5);
      setConcepts(results);
      if (results.length === 0) setError('Ingen definisjon funnet i begrepskatalogen.');
    } catch {
      setError('Begrepskatalogen er ikke tilgjengelig akkurat nå.');
    } finally {
      setLoading(false);
    }
  };

  return <span className="inline-concept-text">{parts.map((part, index) => part.link ? <button type="button" className="concept-inline-link" key={`${part.link.query}-${index}`} onClick={() => void openConcept(part.link!)} aria-expanded={activeLink?.query === part.link.query}>{part.text}</button> : <span key={`text-${index}`}>{part.text}</span>)}{activeLink && <span className="concept-popover" role="status"><button type="button" className="concept-popover-close" onClick={() => setActiveLink(null)} aria-label="Lukk begrepsforklaring"><X size={14} /></button><strong>Begrepsforklaring: {activeLink.label}</strong>{loading && <span className="concept-popover-loading"><LoaderCircle size={14} className="spin" /> Henter definisjon…</span>}{!loading && error && <span className="concept-popover-error">{error}</span>}{!loading && concepts.length > 0 && <span className="concept-popover-results">{concepts.slice(0, 3).map((concept) => <span className="concept-popover-result" key={concept.id}><ConceptTrust concept={concept} /><strong>{concept.term}</strong><span>{concept.definition ?? 'Treffet har ingen publisert definisjon.'}</span><small>{concept.publisher} · hentet {new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short' }).format(new Date(concept.retrievedAt))}</small><a href={concept.sourceUrl} target="_blank" rel="noreferrer">Åpne kilde <ExternalLink size={12} /></a></span>)}</span>}</span>}</span>;
}
