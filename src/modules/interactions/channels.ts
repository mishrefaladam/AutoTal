import type { InteractionChannel } from "@/generated/prisma/enums";

/**
 * Website-Interaktionen: Klicks auf ausgehende Kontakt- und Plattformlinks.
 *
 * ABGRENZUNG ZUM CRM – der eigentliche Zweck dieses Moduls:
 *
 * Ein Klick ist keine Anfrage. Wer auf „WhatsApp“ tippt, hat noch nichts
 * geschrieben; wer willhaben öffnet, hat kein Fahrzeug gekauft und nicht einmal
 * eines angefragt. Aus solchen Klicks CRM-Leads zu erzeugen würde die
 * Vertriebsliste mit Kontakten füllen, die es nicht gibt, und die Statistik
 * unbrauchbar machen – man wüsste nie mehr, welche Zahl eine echte Anfrage ist.
 *
 * Deshalb liegen diese Zahlen in einer eigenen Tabelle, unter eigenen Namen,
 * mit eigenem Enum. Sie beantworten genau eine Frage: Wie oft wurde eine
 * Schaltfläche gedrückt? Nicht, ob daraus ein Gespräch, eine Anfrage oder ein
 * Verkauf wurde – das weiß die Website nicht und darf sie nicht behaupten.
 *
 * DATENSCHUTZ: Gezählt wird nur der Kanal und der Tag. Kein Ereignisdatensatz,
 * keine IP-Adresse, kein User-Agent, keine Kennung, kein genauer Zeitpunkt.
 */

/**
 * Reihenfolge im Admin – gruppiert nach Art des Kanals: erst der direkte
 * Kontakt, dann die Fahrzeugplattformen, zuletzt Social Media.
 */
export const INTERACTION_CHANNEL_ORDER: InteractionChannel[] = [
  "PHONE",
  "WHATSAPP",
  "EMAIL",
  "WILLHABEN",
  "AUTOSCOUT",
  "GEBRAUCHTWAGEN",
  "INSTAGRAM",
  "TIKTOK",
];

/**
 * Beschriftungen als vollständiger Record: Kommt im Schema ein Kanal dazu,
 * schlägt hier der Typecheck fehl, statt dass im Admin „AUTOSCOUT“ steht.
 */
export const INTERACTION_CHANNEL_LABELS: Record<InteractionChannel, string> = {
  PHONE: "Telefon",
  WHATSAPP: "WhatsApp",
  EMAIL: "E-Mail",
  WILLHABEN: "willhaben",
  AUTOSCOUT: "AutoScout24",
  GEBRAUCHTWAGEN: "gebrauchtwagen.at",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
};

/**
 * Was ein Klick auf diesen Kanal tatsächlich bedeutet.
 *
 * Steht im Admin unter der Zahl. Bewusst zurückhaltend formuliert: „Nummer
 * geöffnet“ statt „angerufen“ – ob das Gespräch zustande kam, weiß die Website
 * nicht.
 */
export const INTERACTION_CHANNEL_MEANINGS: Record<InteractionChannel, string> =
  {
    PHONE: "Telefonnummer geöffnet",
    WHATSAPP: "WhatsApp-Chat geöffnet",
    EMAIL: "E-Mail-Programm geöffnet",
    WILLHABEN: "Angebot auf willhaben geöffnet",
    AUTOSCOUT: "Angebot auf AutoScout24 geöffnet",
    GEBRAUCHTWAGEN: "Angebot auf gebrauchtwagen.at geöffnet",
    INSTAGRAM: "Instagram-Profil geöffnet",
    TIKTOK: "TikTok-Profil geöffnet",
  };

/**
 * Prüft einen rohen Wert aus dem Netzwerk.
 *
 * Der Zählendpunkt ist öffentlich; es darf nur zählen, was hier durchkommt.
 */
export function parseInteractionChannel(
  raw: unknown,
): InteractionChannel | null {
  if (typeof raw !== "string") return null;

  return (INTERACTION_CHANNEL_ORDER as readonly string[]).includes(raw)
    ? (raw as InteractionChannel)
    : null;
}

/**
 * Social-Netzwerk eines `SocialLink` auf einen Zählkanal abbilden.
 *
 * Zuvor stand diese Zuordnung als Bedingung im Footer und kannte nur
 * Instagram – ein TikTok-Link wurde zwar angezeigt, aber nie gezählt. Als
 * Tabelle steht sie neben den Kanälen selbst: Ein neues Netzwerk braucht hier
 * eine Zeile und sonst nichts.
 *
 * Netzwerke ohne Zählkanal bleiben bewusst zulässig – ihr Link funktioniert
 * dann wie jeder andere, er taucht nur in keiner Statistik auf.
 */
const CHANNEL_BY_SOCIAL_PLATFORM: Record<string, InteractionChannel> = {
  instagram: "INSTAGRAM",
  tiktok: "TIKTOK",
};

export function interactionChannelForSocialPlatform(
  platform: string,
): InteractionChannel | null {
  return CHANNEL_BY_SOCIAL_PLATFORM[platform.trim().toLowerCase()] ?? null;
}
