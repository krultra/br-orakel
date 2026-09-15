import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { ConceptLookup } from './ConceptLookup.js';
import type { ObligationConceptLink } from '../domain/types';
import { normalizeConceptSelection, splitConceptText } from './concept-text.js';

export function InlineConceptText({ text, links, showSelectionTip = true }: { text: string; links?: ObligationConceptLink[]; showSelectionTip?: boolean }) {
  const parts = useMemo(() => splitConceptText(text, links ?? []), [links, text]);
  const textRef = useRef<HTMLSpanElement>(null);
  const [selectedText, setSelectedText] = useState('');

  useEffect(() => setSelectedText(''), [text, links]);

  const captureSelection = (_event: ReactMouseEvent<HTMLSpanElement> | ReactKeyboardEvent<HTMLSpanElement>) => {
    const selection = window.getSelection();
    const root = textRef.current;
    if (!selection || !root || selection.rangeCount === 0 || !root.contains(selection.getRangeAt(0).commonAncestorContainer)) return;
    const value = normalizeConceptSelection(selection.toString());
    setSelectedText(value.length >= 2 ? value : '');
  };

  return <span className="inline-concept-text" ref={textRef} onMouseUp={captureSelection} onKeyUp={captureSelection}>{parts.map((part, index) => part.link ? <ConceptLookup label={part.link.label} query={part.link.query} className="concept-inline-link" key={`${part.link.query}-${index}`}>{part.text}</ConceptLookup> : <span key={`text-${index}`}>{part.text}</span>)}{showSelectionTip && <span className="concept-selection-tip">Marker et ord eller uttrykk i teksten for å få en begrepsforklaring.</span>}{selectedText && <span className="concept-selection-toolbar" role="status"><span>Markert tekst: <strong>«{selectedText}»</strong></span><ConceptLookup label={selectedText} query={selectedText} className="concept-selection-action">Forklar begrep</ConceptLookup></span>}</span>;
}
