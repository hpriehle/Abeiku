// Meta-approved message templates: list, create and delete on the hotel's
// WhatsApp Business account (WABA). Templates live on Meta's side; we don't
// mirror them in our DB, so the dashboard always shows Meta's current status.

import type { Hotel } from "@/lib/db";
import { graphFetch } from "./graph";

export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";
export type TemplateStatus =
  | "APPROVED"
  | "PENDING"
  | "REJECTED"
  | "PAUSED"
  | "DISABLED"
  | "IN_APPEAL"
  | "ARCHIVED"
  | "DELETED"
  | "LIMIT_EXCEEDED";

export interface TemplateButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | string;
  text: string;
  url?: string;
  phone_number?: string;
  example?: string[];
}

export interface TemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";
  text?: string;
  buttons?: TemplateButton[];
  example?: { header_text?: string[]; body_text?: string[][] };
}

export interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  status: TemplateStatus;
  category: TemplateCategory;
  rejected_reason?: string;
  components: TemplateComponent[];
}

export interface CreateTemplateInput {
  name: string;
  language: string;
  category: TemplateCategory;
  headerText?: string;
  headerExample?: string;
  body: string;
  bodyExamples?: string[];
  footer?: string;
  quickReplies?: string[];
  urlButton?: { text: string; url: string; example?: string };
}

export class WhatsAppNotConnectedError extends Error {
  constructor() {
    super("WhatsApp is not connected for this hotel");
  }
}

function creds(hotel: Hotel) {
  if (!hotel.whatsapp_access_token || !hotel.whatsapp_waba_id) throw new WhatsAppNotConnectedError();
  return { token: hotel.whatsapp_access_token, wabaId: hotel.whatsapp_waba_id };
}

/** Number of distinct {{n}} placeholders in a template string. */
export function countPlaceholders(text: string | undefined): number {
  if (!text) return 0;
  const nums = new Set([...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1]));
  return nums.size;
}

/** WhatsApp wants international format, digits only: "+233 24 123 4567" -> "233241234567" */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^00/, "");
}

/** Meta template names: lowercase letters, digits and underscores, max 512 chars. */
export function normalizeTemplateName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 512);
}

export async function listTemplates(hotel: Hotel): Promise<MetaTemplate[]> {
  const { token, wabaId } = creds(hotel);
  const out: MetaTemplate[] = [];
  let after: string | undefined;
  // Page through results; hotels rarely have more than a few dozen templates.
  for (let page = 0; page < 10; page++) {
    const res = await graphFetch<{ data: MetaTemplate[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      `${wabaId}/message_templates`,
      token,
      {
        query: {
          fields: "id,name,language,status,category,rejected_reason,components",
          limit: "100",
          ...(after ? { after } : {}),
        },
      },
    );
    out.push(...res.data);
    if (!res.paging?.next) break;
    after = res.paging.cursors?.after;
  }
  return out.filter((t) => t.status !== "DELETED");
}

export async function createTemplate(hotel: Hotel, input: CreateTemplateInput) {
  const { token, wabaId } = creds(hotel);
  const components: object[] = [];

  if (input.headerText?.trim()) {
    const header: Record<string, unknown> = { type: "HEADER", format: "TEXT", text: input.headerText.trim() };
    if (countPlaceholders(input.headerText) > 0) {
      header.example = { header_text: [input.headerExample || "Example"] };
    }
    components.push(header);
  }

  const body: Record<string, unknown> = { type: "BODY", text: input.body.trim() };
  const bodyVars = countPlaceholders(input.body);
  if (bodyVars > 0) {
    const examples = Array.from({ length: bodyVars }, (_, i) => input.bodyExamples?.[i]?.trim() || `example ${i + 1}`);
    body.example = { body_text: [examples] };
  }
  components.push(body);

  if (input.footer?.trim()) components.push({ type: "FOOTER", text: input.footer.trim() });

  const buttons: object[] = [];
  for (const text of input.quickReplies ?? []) {
    if (text.trim()) buttons.push({ type: "QUICK_REPLY", text: text.trim() });
  }
  if (input.urlButton?.text.trim() && input.urlButton.url.trim()) {
    const btn: Record<string, unknown> = { type: "URL", text: input.urlButton.text.trim(), url: input.urlButton.url.trim() };
    if (countPlaceholders(input.urlButton.url) > 0) btn.example = [input.urlButton.example || input.urlButton.url];
    buttons.push(btn);
  }
  if (buttons.length) components.push({ type: "BUTTONS", buttons });

  return graphFetch<{ id: string; status: TemplateStatus; category: TemplateCategory }>(
    `${wabaId}/message_templates`,
    token,
    {
      body: {
        name: normalizeTemplateName(input.name),
        language: input.language,
        category: input.category,
        components,
      },
    },
  );
}

/** Deletes every language version of the named template. */
export async function deleteTemplate(hotel: Hotel, name: string) {
  const { token, wabaId } = creds(hotel);
  return graphFetch<{ success: boolean }>(`${wabaId}/message_templates`, token, {
    method: "DELETE",
    query: { name },
  });
}

/** Render a template's body with values substituted, for previews and inbox logging. */
export function renderTemplateText(template: MetaTemplate, bodyParams: string[] = [], headerParam?: string): string {
  const sub = (text: string, values: string[]) =>
    text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => values[Number(n) - 1] ?? `{{${n}}}`);
  const header = template.components.find((c) => c.type === "HEADER" && c.format === "TEXT")?.text;
  const body = template.components.find((c) => c.type === "BODY")?.text ?? "";
  const footer = template.components.find((c) => c.type === "FOOTER")?.text;
  return [header && `*${sub(header, headerParam ? [headerParam] : [])}*`, sub(body, bodyParams), footer && `_${footer}_`]
    .filter(Boolean)
    .join("\n\n");
}
