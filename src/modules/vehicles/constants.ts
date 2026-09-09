/**
 * Herkunft eines Fahrzeugdatensatzes.
 *
 * Seit der Umstellung auf die eingebettete willhaben-Fahrzeugbörse gibt es nur
 * noch eine Quelle: Fahrzeuge, die im Adminbereich gepflegt werden. Sie
 * speisen ausschließlich die Social-Media-Funktion, nicht den öffentlichen
 * Bestand – der kommt vollständig aus dem Widget.
 *
 * Das Feld bleibt erhalten, damit später eine echte Datenquelle danebentreten
 * kann, ohne die bestehenden Datensätze anzufassen.
 */
export const MANUAL_SOURCE = "manual";

/**
 * Herkünfte, deren Fahrzeuge im Admin gepflegt werden dürfen.
 *
 * Von Hand angelegte Fahrzeuge und solche aus dem CSV-Bestandsimport gehören
 * dazu. Der Import ist kein Sync: Er schreibt ausschließlich die Felder seiner
 * Datei und lässt Bilder, Beschreibung, Ausstattung, Extras, Highlights und
 * interne Notizen unangetastet. Eine Bearbeitung hier geht deshalb beim
 * nächsten Import NICHT verloren.
 *
 * Alles andere bleibt schreibgeschützt: Das ist Altbestand aus der früheren,
 * abgeschalteten Datenquelle, dessen Herkunft nicht mehr nachvollziehbar ist.
 */
export const EDITABLE_SOURCES: readonly string[] = [MANUAL_SOURCE, "csv-import"];

export function isEditableSource(externalSource: string): boolean {
  return EDITABLE_SOURCES.includes(externalSource);
}
