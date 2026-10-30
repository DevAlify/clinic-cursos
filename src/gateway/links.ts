import { z } from 'zod';
import { BASE_URL } from '../config.ts';
import { appendAndProject } from '../core/apply.ts';
import { newCode } from '../core/codes.ts';
import type { Db } from '../core/db.ts';
import { UNITS } from '../core/events.ts';
import { isValidCampaign, isValidEntryPoint } from '../core/naming.ts';
import { getEntryPoint, getLink } from '../core/queries.ts';
import type { Rules } from '../core/types.ts';

export const linkRequestSchema = z.object({
  entryPoint: z.string().max(200).refine(isValidEntryPoint, { message: 'ponto de entrada fora do padrão unidade-tipo-local-nn' }),
  label: z.string().min(3).max(200),
  owner: z.string().min(2).max(200),
  channel: z.string().min(2).max(200),
  campaign: z.string().max(200).refine(isValidCampaign, { message: 'campanha fora do padrão unidade_produto_objetivo_aaaamm' }),
  unit: z.enum(UNITS),
  product: z.string().min(2).max(200),
  linkType: z.enum(['url', 'whatsapp', 'qr', 'hotmart']),
  // Only web pages: a javascript: or data: destination would turn the QR redirector into an attack vector.
  destination: z.url({ protocol: /^https?$/ }).max(2048).optional(),
});
export type LinkRequest = z.infer<typeof linkRequestSchema>;

const UTM_BY_CHANNEL: Record<string, { source: string; medium: string }> = {
  google_ads: { source: 'google', medium: 'cpc' },
  meta_ads: { source: 'instagram', medium: 'paid_social' },
  qr: { source: 'qr', medium: 'offline' },
  email: { source: 'newsletter', medium: 'email' },
};

function whatsappNumberOf(db: Db, unit: string): string {
  const row = db.prepare("SELECT business_number FROM entry_points WHERE unit = ? AND kind = 'whatsapp' AND business_number IS NOT NULL LIMIT 1").get(unit) as { business_number: string } | undefined;
  if (!row) throw new Error(`nenhum WhatsApp cadastrado para a unidade ${unit}`);
  return row.business_number;
}

function destinationFor(db: Db, req: LinkRequest, code: string): string {
  if (req.linkType === 'whatsapp' || req.linkType === 'qr') {
    return `https://wa.me/${whatsappNumberOf(db, req.unit)}?text=${encodeURIComponent(`Olá! Quero saber mais (cód. ${code})`)}`;
  }
  if (!req.destination) throw new Error('informe a página de destino');
  const url = new URL(req.destination);
  if (req.linkType === 'hotmart') {
    url.searchParams.set('sck', code);
    return url.toString();
  }
  const utm = UTM_BY_CHANNEL[req.channel] ?? { source: req.channel, medium: 'referral' };
  url.searchParams.set('utm_source', utm.source);
  url.searchParams.set('utm_medium', utm.medium);
  url.searchParams.set('utm_campaign', req.campaign);
  url.searchParams.set('utm_content', code);
  return url.toString();
}

// Nobody types UTMs: the generator builds the link and registers the point as "em auditoria".
export function generateLink(db: Db, req: LinkRequest, rules: Rules, now: string): { code: string; publish: string } {
  if (!req.entryPoint.startsWith(`${req.unit}-`)) throw new Error('o ponto de entrada precisa começar pela unidade');
  const code = newCode((c) => getLink(db, c) !== null);
  const destination = destinationFor(db, req, code);
  if (!getEntryPoint(db, req.entryPoint)) {
    appendAndProject(db, {
      source: 'tool', externalId: `ep:${req.entryPoint}`, type: 'entry_point_registered', occurredAt: now, actor: 'marketing:gerador',
      payload: { code: req.entryPoint, unit: req.unit, kind: req.linkType, label: req.label, owner: req.owner, status: 'auditing', product: req.product, businessNumber: null },
    }, rules);
  }
  appendAndProject(db, {
    source: 'tool', externalId: `link:${code}`, type: 'link_generated', occurredAt: now, actor: 'marketing:gerador',
    payload: { code, entryPoint: req.entryPoint, channel: req.channel, campaign: req.campaign, unit: req.unit, product: req.product, destination, linkType: req.linkType },
  }, rules);
  return { code, publish: req.linkType === 'qr' ? `${BASE_URL}/r/${code}` : destination };
}
