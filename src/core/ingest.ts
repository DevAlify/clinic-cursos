import { aiReaction } from '../ai/agent.ts';
import { callTool } from '../tools/registry.ts';
import { appendAndProject, type ApplyResult } from './apply.ts';
import type { Db } from './db.ts';
import type { Payload } from './events.ts';
import { alertText, findCoverageDrop } from './monitor.ts';
import { isValidCampaign } from './naming.ts';
import { getEntryPoint, getTouch, touchesOfEntryPoint } from './queries.ts';
import type { AnyEventInput, EventRow, Fetch, Rules } from './types.ts';

// Live entry point: store, project, then react. Reactions write new events; replay only projects.
// fetch reaches the ERP and the WhatsApp provider; tests and verify run offline.
export async function ingest(db: Db, input: AnyEventInput, rules: Rules, transient: { text?: string } = {}, fetchImpl: Fetch = fetch): Promise<ApplyResult> {
  const r = appendAndProject(db, input, rules);
  if (!r.event || r.error) return r;
  if (r.event.type === 'whatsapp_message_received') await aiReaction(db, r.event as EventRow<'whatsapp_message_received'>, transient.text ?? '', rules, fetchImpl);
  if (r.event.type === 'form_submitted' || r.event.type === 'whatsapp_message_received') await monitorReaction(db, r.event.seq, r.event.occurredAt, rules);
  return r;
}

function raise(db: Db, seq: number, occurredAt: string, payload: Payload<'alert_raised'>, rules: Rules): void {
  appendAndProject(db, { source: 'monitor', externalId: `alert:${payload.kind}:${payload.entryPoint}:${seq}`, type: 'alert_raised', occurredAt, actor: 'monitor', payload }, rules);
}

export async function monitorReaction(db: Db, seq: number, occurredAt: string, rules: Rules): Promise<void> {
  const touch = getTouch(db, seq);
  const code = touch?.fields.entryPoint.value;
  if (!touch || touch.isTest || !code) return;
  const ep = getEntryPoint(db, code);
  if (!ep) return;
  const campaign = touch.fields.campaign;
  if (campaign.level === 'observed' && campaign.value && !isValidCampaign(campaign.value)) {
    raise(db, seq, occurredAt, { entryPoint: code, kind: 'naming_nonconforming', message: `Campanha fora do padrão: ${campaign.value}`, action: 'Gerar o link pelo gerador, com valores do catálogo.', owner: ep.owner }, rules);
  }
  if (ep.status !== 'released') return;
  const points = touchesOfEntryPoint(db, code).map((t) => ({ seq: t.seq, occurredAt: t.occurredAt, campaignLevel: t.fields.campaign.level, isTest: t.isTest }));
  const affected = findCoverageDrop(points);
  if (!affected) return;
  const text = alertText(ep.label, affected[0].occurredAt, affected.length, ep.owner);
  raise(db, seq, occurredAt, { entryPoint: code, kind: 'campaign_coverage_drop', message: text.message, action: text.action, owner: ep.owner }, rules);
  await callTool(db, 'set_entry_point_status', { code, status: 'auditing', reason: text.message }, 'monitor', rules, occurredAt);
}
