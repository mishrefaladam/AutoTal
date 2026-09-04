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
