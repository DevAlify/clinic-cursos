import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCode, newCode, CODE_ALPHABET } from '../src/core/codes.ts';
import { isValidCampaign, isValidEntryPoint } from '../src/core/naming.ts';
import { originFromForm, originFromWhatsApp, withDeclaredChannel } from '../src/core/origin.ts';
import { findOffer, isCatalogProduct } from '../src/erp/catalog.ts';

const lp = { code: 'cps-lp-hof-01', unit: 'cps', product: 'hof', businessNumber: null };
const cpsNumber = { code: 'cps-whatsapp-principal-01', unit: 'cps', product: null, businessNumber: '551930000003' };
const qrLink = { code: 'K7P2', entryPoint: 'rj-banner-recepcao-01', channel: 'qr', campaign: 'rj_cursos_divulgacao_202610', unit: 'rj', product: 'cursos' };

test('a form with gclid and UTMs is observed field by field', () => {
  const f = originFromForm({ entryPoint: 'cps-lp-hof-01', utm: { source: 'google', medium: 'cpc', campaign: 'cps_hof_captacao_202610' }, clickIds: { gclid: 'G1' } }, lp);
  assert.deepEqual(f.channel, { value: 'google_ads', level: 'observed', reader: 'system', evidence: 'gclid' });
  assert.equal(f.campaign.value, 'cps_hof_captacao_202610');
  assert.equal(f.campaign.level, 'observed');
  assert.deepEqual([f.unit.value, f.unit.level, f.product.value], ['cps', 'observed', 'hof']);
});

test('a lost UTM keeps the channel and never invents the campaign', () => {
  const f = originFromForm({ entryPoint: 'cps-lp-hof-01', utm: {}, clickIds: { gclid: 'G2' } }, lp);
  assert.equal(f.channel.level, 'observed');
  assert.deepEqual(f.campaign, { value: null, level: 'unknown', reader: 'system' });
});

test('a form without any evidence has an unknown channel', () => {
  assert.equal(originFromForm({ entryPoint: 'cps-lp-hof-01', utm: {}, clickIds: {} }, lp).channel.level, 'unknown');
});

test('a WhatsApp message with a code takes all five fields from the link', () => {
  const f = originFromWhatsApp({ businessNumber: '552130000002', code: 'K7P2', referral: null }, null, qrLink);
  assert.deepEqual(f.entryPoint, { value: 'rj-banner-recepcao-01', level: 'observed', reader: 'code:K7P2' });
  assert.equal(f.channel.value, 'qr');
  assert.equal(f.unit.level, 'observed');
});

test('a WhatsApp message without a code infers only the unit from the number', () => {
  const f = originFromWhatsApp({ businessNumber: '551930000003', code: null, referral: null }, cpsNumber, null);
  assert.equal(f.entryPoint.level, 'observed');
  assert.equal(f.channel.level, 'unknown');
  assert.deepEqual(f.unit, { value: 'cps', level: 'inferred', reader: 'rule:unit-from-number@v1' });
});

test('a click-to-WhatsApp referral is an observed Meta Ads channel', () => {
  const f = originFromWhatsApp({ businessNumber: '551930000003', code: null, referral: { sourceId: 'AD1', sourceType: 'ad', ctwaClid: null } }, cpsNumber, null);
  assert.deepEqual(f.channel, { value: 'meta_ads', level: 'observed', reader: 'referral', evidence: 'ad:AD1' });
});

test('a declared channel keeps the quote as evidence', () => {
  const f = withDeclaredChannel(originFromWhatsApp({ businessNumber: '551930000003', code: null, referral: null }, cpsNumber, null), 'instagram', 'ai:simulated-v1', 'Vi no insta');
  assert.deepEqual(f.channel, { value: 'instagram', level: 'declared', reader: 'ai:simulated-v1', evidence: 'Vi no insta' });
});

test('naming follows unidade_produto_objetivo_aaaamm and unidade-tipo-local-nn', () => {
  assert.equal(isValidCampaign('cps_hof_captacao_202610'), true);
  assert.equal(isValidCampaign('Campanha HOF'), false);
  assert.equal(isValidEntryPoint('sp-banner-recepcao-01'), true);
  assert.equal(isValidEntryPoint('online-anuncio-instagram-stories-01'), true);
  assert.equal(isValidEntryPoint('banner_sp'), false);
});

test('short codes avoid ambiguous characters and are read from the message', () => {
  assert.equal(/[01ILO]/.test(CODE_ALPHABET), false);
  assert.match(newCode(() => false), /^[A-HJKMNP-Z2-9]{4}$/);
  assert.equal(extractCode('Quero saber dos cursos (cód. K7P2)'), 'K7P2');
  assert.equal(extractCode('quero saber (cod. k7p2)'), 'K7P2');
  assert.equal(extractCode('(cód. K7P0)'), null);
  assert.equal(extractCode('Oi, tudo bem?'), null);
});

test('the simulated ERP catalog answers offers', () => {
  assert.equal(isCatalogProduct('hof'), true);
  assert.equal(isCatalogProduct('cursos'), false);
  assert.equal(findOffer('hof', 'sp')?.name, 'Harmonização Facial');
  assert.equal(findOffer('hof', 'online'), null);
});
