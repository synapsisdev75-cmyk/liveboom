const BLOCKED = [
  'pornografia infantil',
  'porno infantil',
  'child porn',
  'child sex',
  'cp teen',
  'sexo con menor',
  'sexo con niños',
  'sexo con ninos',
  'nudes de menor',
  'mata a',
  'te voy a matar',
  'i will kill you',
];

function fold(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** Filtro previo de texto. El reporte y el bloqueo siguen disponibles después. */
export function objectionableContentMessage(text: string): string | null {
  const folded = fold(text);
  if (!folded.trim()) return null;
  for (const phrase of BLOCKED) {
    if (folded.includes(fold(phrase))) {
      return 'Este texto no cumple las normas de la comunidad y no se publicó.';
    }
  }
  return null;
}

export function assertAllowedContent(text: string) {
  const message = objectionableContentMessage(text);
  if (message) throw new Error(message);
}
