const conceptQueries: Record<string, string> = {
  'lønn og ytelser': 'lønn',
  'arbeidsforhold': 'arbeidsforhold',
  'forskuddstrekk': 'forskuddstrekk',
  'salg med mva': 'merverdiavgift',
  'kjøp med mva': 'merverdiavgift',
  'kontospesifikasjon': 'kontospesifikasjon',
  'resultatregnskap': 'årsregnskap',
  'balanse': 'årsregnskap',
  'noter': 'årsregnskap',
  'avvik': 'internkontroll',
  'risikovurdering': 'HMS',
  'tiltak': 'HMS',
};

/** Search aliases improve catalogue hits without pretending to define the field locally. */
export function conceptQueryForDataElement(value: string) {
  return conceptQueries[value.trim().toLocaleLowerCase('nb-NO')] ?? value;
}
