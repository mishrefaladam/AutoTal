/**
 * Unternehmensdaten (US-15, US-16).
 *
 * Alle Angaben sind im Admin pflegbar. Header, Footer, Kontaktseite,
 * Impressum und die WhatsApp-Links beziehen ihre Daten ausschließlich hier –
 * es gibt keine hartkodierte Telefonnummer im Code.
 */

export type OpeningHourSlot = {
  id: string;
  /** 1 = Montag … 7 = Sonntag (ISO-8601) */
  weekday: number;
  opensAt: string | null;
  closesAt: string | null;
  closed: boolean;
  note: string | null;
  position: number;
};

export type SocialLinkDto = {
  id: string;
  platform: string;
  url: string;
  label: string | null;
  position: number;
};

export type CompanyDto = {
  legalName: string;
  displayName: string;
  tagline: string | null;
  aboutText: string;

  street: string;
  postalCode: string;
  city: string;
  country: string;
  /** "Bahnhofstraße 12, 4600 Wels" */
  addressLine: string;

  phone: string;
  /** Nur Ziffern, für tel:-Links */
  phoneHref: string;
  whatsappNumber: string | null;
  email: string;

  vatId: string | null;
  commercialRegisterNumber: string | null;
  commercialRegisterCourt: string | null;

  /** Gewerbewortlaut laut Gewerberegister */
  businessPurpose: string | null;
  /** Zuständige Bezirkshauptmannschaft bzw. Magistrat */
  supervisoryAuthority: string | null;
  /** GISA-Zahl */
  gisaNumber: string | null;

  contactPersonName: string | null;
  contactPersonRole: string | null;
  contactPersonEmail: string | null;
  contactPersonPhone: string | null;

  latitude: number | null;
  longitude: number | null;

  willhabenUrl?: string | null;
  autoscoutUrl?: string | null;
  gebrauchtwagenUrl?: string | null;

  openingHours: OpeningHourSlot[];
  socialLinks: SocialLinkDto[];
};

/** Ein Wochentag mit allen Zeitfenstern – für die Anzeige gruppiert. */
export type OpeningDay = {
  weekday: number;
  label: string;
  closed: boolean;
  /** ["08:00 – 12:00", "13:00 – 18:00"] */
  ranges: string[];
  note: string | null;
};

export type OpeningStatus = {
  isOpen: boolean;
  /** "Jetzt geöffnet – bis 18:00" bzw. "Geschlossen – öffnet Montag, 08:00" */
  label: string;
};
