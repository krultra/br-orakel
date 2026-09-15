import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { ExternalLink, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import { api } from '../api';
import type { Concept, ObligationConceptLink } from '../domain/types';
import { normalizeConceptSelection, splitConceptText } from './concept-text.js';

function ConceptTrust({ concept }: { concept: Concept }) {
  const label = concept.trustLevel === 'OFFICIAL_GUIDANCE' ? 'Offisiell veiledning' : 'Under vurdering';
  return <span className={`concept-popover-trust trust-${concept.trustLevel.toLowerCase()}`}><ShieldCheck size={13} /> {label}</span>;
}

export function InlineConceptText({ text, links }: { text: string; links?: ObligationConceptLink[] }) {
  const parts = useMemo(() => splitConceptText(text, links ?? []), [links, text]);
  const textRef = useRef<HTMLSpanElement>(null);
  const [selectedText, setSelectedText] = useState('');
  const [activeLink, setActiveLink] = useState<ObligationConceptLink | null>(null);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSelectedText('');
    setActiveLink(null);
    setConcepts([]);
    setError('');
  }, [text, links]);

  const captureSelection = (event: ReactMouseEvent<HTMLSpanElement> | ReactKeyboardEvent<HTMLSpanElement>) => {
    const selection = window.getSelection();
    const root = textRef.current;
    if (!selection || !root || selection.rangeCount === 0 || !root.contains(selection.getRangeAt(0).commonAncestorContainer)) return;
    const value = normalizeConceptSelection(selection.toString());
    setSelectedText(value.length >= 2 ? value : '');
    if (event.type === 'keyup' && value.length < 2) selection.removeAllRanges();
  };

  const openConcept = async (link: ObligationConceptLink) => {
    setActiveLink(link);
    setSelectedText('');
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

  return <span className="inline-concept-text" ref={textRef} onMouseUp={captureSelection} onKeyUp={captureSelection}>{parts.map((part, index) => part.link ? <button type="button" className="concept-inline-link" title="Åpne begrepsforklaring" key={`${part.link.query}-${index}`} onClick={() => void openConcept(part.link!)} aria-expanded={activeLink?.query === part.link.query}>{part.text}</button> : <span key={`text-${index}`}>{part.text}</span>)}<span className="concept-selection-tip">Marker et ord eller uttrykk i teksten for å få en begrepsforklaring.</span>{selectedText && <span className="concept-selection-toolbar" role="status"><span>Markert tekst: <strong>«{selectedText}»</strong></span><button type="button" onClick={() => void openConcept({ label: selectedText, query: selectedText })}>Forklar begrep</button></span>}{activeLink && <span className="concept-popover" role="status"><button type="button" className="concept-popover-close" onClick={() => setActiveLink(null)} aria-label="Lukk begrepsforklaring"><X size={14} /></button><strong>Begrepsforklaring: {activeLink.label}</strong>{loading && <span className="concept-popover-loading"><LoaderCircle size={14} className="spin" /> Henter definisjon…</span>}{!loading && error && <span className="concept-popover-error">{error}</span>}{!loading && concepts.length > 0 && <span className="concept-popover-results">{concepts.slice(0, 3).map((concept) => <span className="concept-popover-result" key={concept.id}><ConceptTrust concept={concept} /><strong>{concept.term}</strong><span>{concept.definition ?? 'Treffet har ingen publisert definisjon.'}</span><small>{concept.publisher} · hentet {new Intl.DateTimeFormat('nb-NO', { dateStyle: 'short' }).format(new Date(concept.retrievedAt))}</small><a href={concept.sourceUrl} target="_blank" rel="noreferrer">Åpne kilde <ExternalLink size={12} /></a></span>)}</span>}</span>}</span>;
}
