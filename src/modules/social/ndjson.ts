/**
 * NDJSON-Zeilen aus einem Stream – ohne Abhängigkeiten, damit es sich ohne
 * Datenbank prüfen lässt.
 */

/** Zerlegt NDJSON zeilenweise, auch wenn eine Zeile über zwei Chunks kommt. */
export function parseNdjsonChunks(
  chunks: readonly string[],
  onEvent: (event: unknown) => void,
): void {
  let buffered = "";
  const consume = (line: string) => {
    if (line.trim()) onEvent(JSON.parse(line));
  };
  for (const chunk of chunks) {
    buffered += chunk;
    let newline = buffered.indexOf("\n");
    while (newline >= 0) {
      consume(buffered.slice(0, newline));
      buffered = buffered.slice(newline + 1);
      newline = buffered.indexOf("\n");
    }
  }
  consume(buffered);
}

