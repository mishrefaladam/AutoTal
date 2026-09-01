import "server-only";

/**
 * E-Mail-Vorlagen für die Formularbenachrichtigungen.
 *
 * Bewusst schlichtes, tabellenbasiertes HTML mit Inline-Styles – das ist der
 * kleinste gemeinsame Nenner, den Outlook, Gmail und Apple Mail zuverlässig
 * gleich darstellen. Zu jeder HTML-Mail gibt es eine Textfassung.
 *
 * Alle Werte laufen durch `escapeHtml()`. Ein Name wie `<script>` darf im
 * Postfach kein Markup erzeugen.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type MailField = {
  label: string;
  value: string | null | undefined;
  /** Mehrzeiliger Fließtext wird als Block statt als Tabellenzeile gesetzt. */
  block?: boolean;
};

export type MailContent = { html: string; text: string };

const BRAND = "#b46a2a";
const INK = "#1f2228";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

export function renderNotificationMail(options: {
  heading: string;
  intro: string;
  fields: MailField[];
  /** Optionaler Hinweisblock am Ende, z. B. der Link zum Fahrzeug. */
  footerNote?: string;
}): MailContent {
  const visible = options.fields.filter(
    (field) => field.value !== null && field.value !== undefined && field.value !== "",
  );

  const rows = visible
    .map((field) => {
      const label = escapeHtml(field.label);
      const value = escapeHtml(String(field.value));

      if (field.block) {
        return `
          <tr>
            <td colspan="2" style="padding:16px 0 0;">
              <div style="font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">${label}</div>
              <div style="font-size:15px;color:${INK};line-height:1.6;white-space:pre-wrap;">${value}</div>
            </td>
          </tr>`;
      }

      return `
        <tr>
          <td style="padding:9px 16px 9px 0;font-size:14px;color:${MUTED};white-space:nowrap;vertical-align:top;">${label}</td>
          <td style="padding:9px 0;font-size:15px;color:${INK};font-weight:600;vertical-align:top;">${value}</td>
        </tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="de">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:24px 12px;background:#f6f5f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid ${BORDER};">
      <tr>
        <td style="padding:28px 28px 0;">
          <div style="font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${BRAND};">Website-Anfrage</div>
          <h1 style="margin:10px 0 0;font-size:22px;line-height:1.3;color:${INK};">${escapeHtml(options.heading)}</h1>
          <p style="margin:10px 0 0;font-size:15px;line-height:1.6;color:${MUTED};">${escapeHtml(options.intro)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 28px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        </td>
      </tr>
      ${
        options.footerNote
          ? `<tr><td style="padding:16px 28px 0;">
               <div style="padding:14px 16px;background:#faf7f3;border-left:3px solid ${BRAND};font-size:14px;line-height:1.6;color:${INK};">${escapeHtml(options.footerNote)}</div>
             </td></tr>`
          : ""
      }
      <tr>
        <td style="padding:24px 28px 28px;">
          <hr style="border:0;border-top:1px solid ${BORDER};margin:0 0 14px;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};">
            Diese Nachricht wurde über das Kontaktformular der Website gesendet.
            Antworten Sie einfach auf diese E-Mail, um dem Absender direkt zu antworten.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textLines = [
    options.heading.toUpperCase(),
    "",
    options.intro,
    "",
    ...visible.map((field) =>
      field.block
        ? `\n${field.label}:\n${field.value}`
        : `${field.label}: ${field.value}`,
    ),
  ];

  if (options.footerNote) textLines.push("", options.footerNote);

  textLines.push(
    "",
    "---",
    "Gesendet über das Kontaktformular der Website.",
  );

  return { html, text: textLines.join("\n") };
}
