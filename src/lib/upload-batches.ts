/**
 * Teilt Dateien in Stapel, die der Server je Anfrage annimmt.
 *
 * Eine einzelne Datei über dem Limit kommt in einen eigenen Stapel und wird
 * dort vom Server mit Begründung abgelehnt – so erscheint sie im Ergebnis
 * statt still zu verschwinden. Reine Funktion, ohne Bezug auf React oder
 * Browser, damit sie sich ohne beides prüfen lässt.
 */
export function batchFiles<T extends { size: number }>(
  files: readonly T[],
  maxBytes: number,
  maxCount: number,
): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let bytes = 0;

  for (const file of files) {
    const overflow =
      current.length > 0 && (bytes + file.size > maxBytes || current.length >= maxCount);
    if (overflow) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(file);
    bytes += file.size;
  }
  if (current.length > 0) batches.push(current);

  return batches;
}
