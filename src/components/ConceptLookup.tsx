import { useState, type ReactNode } from 'react';
import { ExternalLink, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import { api } from '../api';
import type { Concept } from '../domain/types';

function ConceptTrust({ concept }: { concept: Concept }) {
  const label = concept.trustLevel === 'OFFICIAL_GUIDANCE' ? 'Offisiell veiledning' : 'Under vurdering';
  return <span className={`concept-popover-trust trust-${concept.trustLevel.toLowerCase()}`}><ShieldCheck size={13} /> {label}</span>;
}

export function ConceptLookup({ label, query = label, children, className = 'concept-inline-link', title = 'Åpne begrepsforklaring' }: { label: string; query?: string; children?: ReactNode; className?: string; title?: string }) {
  const [open, setOpen] = useState(false);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const lookup = async () => {
    setOpen(true);
    setConcepts([]);
    setError('');
    setLoading(true);
    try {
      const results = await api.concepts(query, 5);
      setConcepts(results);
      if (results.length === 0) setError('Ingen definisjon funnet i begrepskatalogen.');
    } catch {
      setError('Begrepskatalogen er ikke tilgjengelig akkurat nå.');
    } finally {
      setLoading(false);
    }
  };

  return <span className="concept-lookup"><button type="button" className={className} title={title} aria-expanded={open} onClick={() => void lookup()}>{children ?? label}</button>{open && <span className="concept-popover" role="status"><button type="button" className="concept-popover-close" onClick={() => setOpen(false)} aria-label="Lukk begrepsforklaring"><X size={14} /></button><strong>Begrepsforklaring: {label}</strong>{loading && <span className="concept-popover-loading"><LoaderCircle size={14} className="spin" /> Henter definisjon…</span>}{!loading && error && <span className="concept-popover-error">{error}</span>}{!loading && concepts.length > 0 && <span className="concept-popover-results">{concepts.slice(0, 3).map((concept) => <span className="concept-popover-result" key={concept.id}><ConceptTrust concept={concept} /><strong>{concept.term}</strong><span>{concept.definition ?? 'Treffet har ingen publisert definisjon.'}</span><small>{concept.publisher} · hentet {new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short' }).format(new Date(concept.retrievedAt))}</small><a href={concept.sourceUrl} target="_blank" rel="noreferrer">Åpne kilde <ExternalLink size={12} /></a></span>)}</span>}</span>}</span>;
}
