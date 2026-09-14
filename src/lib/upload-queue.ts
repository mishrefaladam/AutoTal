/**
 * Warteschlange für Uploads: begrenzte Parallelität, kontrollierte Wiederholung.
 *
 * WARUM: Elf Fotos vom iPhone sind elf Anfragen von je einigen Megabyte über
 * Mobilfunk. Alle zugleich loszuschicken überlastet die Leitung; mobile
 * Safari bricht dann einzelne Verbindungen ab. Jede Datei einzeln und
 * nacheinander wäre dagegen unnötig langsam. Zwei bis drei gleichzeitig ist
 * der übliche Mittelweg.
 *
 * WIEDERHOLEN: Ein Netzwerkabbruch ist kein Urteil über die Datei – die
 * zweite Übertragung klappt meist. Eine Ablehnung ("kein JPEG", "zu groß")
 * ist dagegen endgültig; sie zu wiederholen wäre sinnlos. Der Aufrufer
 * markiert deshalb jeden Fehler als wiederholbar oder nicht (`UploadError`).
 * Höchstens `maxAttempts` automatische Versuche je Datei; danach entscheidet
 * der Nutzer über eine Schaltfläche.
 *
 * Reine Funktion ohne DOM oder React – damit sie sich mit gefälschten
 * Arbeitern prüfen lässt.
 */

export class UploadError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "UploadError";
    this.retryable = retryable;
  }
}

export type UploadItemState =
  | { kind: "pending" }
  | { kind: "uploading"; attempt: number }
  | { kind: "retrying"; attempt: number }
  | { kind: "done" }
  | { kind: "failed"; message: string; retryable: boolean };

export type UploadOutcome<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; message: string; retryable: boolean; attempts: number };

export type UploadQueueOptions = {
  /** Gleichzeitig laufende Uploads. */
  concurrency: number;
  /** Automatische Versuche je Datei, den ersten eingeschlossen. */
  maxAttempts: number;
  /** Pause vor einem erneuten Versuch; wächst je Versuch linear. */
  backoffMs: number;
  onState?: (index: number, state: UploadItemState) => void;
  sleep?: (milliseconds: number) => Promise<void>;
};

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Fehler außerhalb von `UploadError` gelten als Netzwerkfehler – wiederholbar. */
function classify(error: unknown): { message: string; retryable: boolean } {
  if (error instanceof UploadError) {
    return { message: error.message, retryable: error.retryable };
  }
  return {
    message: "Die Verbindung ist abgebrochen.",
    retryable: true,
  };
}

/**
 * Arbeitet `items` mit höchstens `concurrency` gleichzeitigen Arbeitern ab.
 * Die Ergebnisliste hat dieselbe Reihenfolge wie die Eingabe; ein Fehler bei
 * einem Element hält die anderen nicht auf.
 */
export async function runUploadQueue<I, T>(
  items: readonly I[],
  worker: (item: I, attempt: number) => Promise<T>,
  options: UploadQueueOptions,
): Promise<UploadOutcome<T>[]> {
  const sleep = options.sleep ?? defaultSleep;
  const concurrency = Math.max(1, Math.floor(options.concurrency));
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts));
  const outcomes: UploadOutcome<T>[] = new Array(items.length);
  let next = 0;

  async function runOne(index: number): Promise<void> {
    const item = items[index];
    let attempt = 0;

    for (;;) {
      attempt += 1;
      options.onState?.(index, { kind: "uploading", attempt });

      try {
        const value = await worker(item, attempt);
        outcomes[index] = { ok: true, value, attempts: attempt };
        options.onState?.(index, { kind: "done" });
        return;
      } catch (error) {
        const { message, retryable } = classify(error);

        if (retryable && attempt < maxAttempts) {
          options.onState?.(index, { kind: "retrying", attempt: attempt + 1 });
          await sleep(options.backoffMs * attempt);
          continue;
        }

        outcomes[index] = { ok: false, message, retryable, attempts: attempt };
        options.onState?.(index, { kind: "failed", message, retryable });
        return;
      }
    }
  }

  async function lane(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      await runOne(index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => lane()));
  return outcomes;
}
