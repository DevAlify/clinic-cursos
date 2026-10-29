import type { Field, Fields, Level } from './types.ts';

export const LEVEL_LABEL: Record<Level, string> = {
  observed: 'observada', declared: 'declarada', inferred: 'inferida', unknown: 'desconhecida',
};

export interface EntryPointInfo { code: string; unit: string; product: string | null; businessNumber: string | null }
export interface LinkInfo { code: string; entryPoint: string; channel: string; campaign: string; unit: string; product: string }

interface Utm { source?: string; medium?: string; campaign?: string }
interface ClickIds { gclid?: string; fbclid?: string }

export function field(value: string | null, level: Level, reader: string, evidence?: string): Field {
  return evidence ? { value, level, reader, evidence } : { value, level, reader };
}
export const unknownField = (reader = 'system'): Field => field(null, 'unknown', reader);
export const unknownFields = (reader: string): Fields => ({
  entryPoint: unknownField(reader), channel: unknownField(reader), campaign: unknownField(reader),
  unit: unknownField(reader), product: unknownField(reader),
});

export function channelFromForm(utm: Utm, clickIds: ClickIds): Field {
  if (clickIds.gclid) return field('google_ads', 'observed', 'system', 'gclid');
  if (clickIds.fbclid) return field('meta_ads', 'observed', 'system', 'fbclid');
  const source = utm.source?.toLowerCase();
  const medium = utm.medium?.toLowerCase();
  if (!source || !medium) return unknownField();
  if (source === 'google' && ['cpc', 'paid'].includes(medium)) return field('google_ads', 'observed', 'system', 'utm');
  if (['facebook', 'instagram', 'meta'].includes(source) && ['cpc', 'paid', 'paid_social'].includes(medium)) {
    return field('meta_ads', 'observed', 'system', 'utm');
  }
  return field(`${source}/${medium}`, 'observed', 'system', 'utm');
}

export function originFromForm(p: { entryPoint: string; utm: Utm; clickIds: ClickIds }, ep: EntryPointInfo | null): Fields {
  return {
    entryPoint: field(p.entryPoint, 'observed', 'system'),
    channel: channelFromForm(p.utm, p.clickIds),
    campaign: p.utm.campaign ? field(p.utm.campaign, 'observed', 'system', 'utm_campaign') : unknownField(),
    unit: ep ? field(ep.unit, 'observed', 'registry') : unknownField(),
    product: ep?.product ? field(ep.product, 'observed', 'registry') : unknownField(),
  };
}

export function originFromWhatsApp(
  p: { businessNumber: string; code: string | null; referral: { sourceId: string; sourceType: string; ctwaClid: string | null } | null },
  ep: EntryPointInfo | null,
  link: LinkInfo | null,
): Fields {
  if (link) {
    const reader = `code:${link.code}`;
    return {
      entryPoint: field(link.entryPoint, 'observed', reader), channel: field(link.channel, 'observed', reader),
      campaign: field(link.campaign, 'observed', reader), unit: field(link.unit, 'observed', reader),
      product: field(link.product, 'observed', reader),
    };
  }
  return {
    entryPoint: ep ? field(ep.code, 'observed', 'system') : unknownField(),
    channel: p.referral ? field('meta_ads', 'observed', 'referral', `ad:${p.referral.sourceId}`) : unknownField(),
    campaign: unknownField(),
    unit: ep ? field(ep.unit, 'inferred', 'rule:unit-from-number@v1') : unknownField(),
    product: unknownField(),
  };
}

export function withDeclaredChannel(fields: Fields, value: string, reader: string, quote: string): Fields {
  return { ...fields, channel: field(value, 'declared', reader, quote) };
}
