import { z } from 'zod';
import { ERP_URL, SECRETS } from '../config.ts';
import { fetchJson } from '../core/http.ts';
import type { Fetch } from '../core/types.ts';
import { findOffer, type CourseOffer } from './catalog.ts';

export interface ErpIo { url?: string; token?: string; fetch?: Fetch }
export interface Contact { name: string | null; phone: string | null; email: string | null }
export interface OrderRequest { opportunityId: string; product: string; unit: string; contact: Contact }

const offerSchema = z.object({ product: z.string(), unit: z.string(), name: z.string(), price: z.number(), seatsLeft: z.number(), nextClass: z.string() });
const orderSchema = z.object({ orderId: z.string().min(1) });

let localOrders = 0;

const target = (io: ErpIo) => ({ url: io.url ?? ERP_URL, token: io.token ?? SECRETS.erpToken, fetch: io.fetch ?? fetch });

// Price, seats and dates always come from the ERP. Without ERP_URL (tests, verify) the simulated catalog stands in.
export async function getOffer(product: string, unit: string, io: ErpIo = {}): Promise<CourseOffer | null> {
  const t = target(io);
  if (!t.url) return findOffer(product, unit);
  const body = await fetchJson(t.fetch, `${t.url}/api/catalog`, { headers: { 'x-erp-token': t.token } }, 'ERP', 'ao ler o catálogo');
  const catalog = z.array(offerSchema).safeParse(body);
  if (!catalog.success) throw new Error('ERP devolveu o catálogo num formato inesperado');
  return catalog.data.find((c) => c.product === product && c.unit === unit) ?? null;
}

// The order carries the opportunity id, so the payment confirmation comes back linked to it.
export async function createOrder(order: OrderRequest, io: ErpIo = {}): Promise<{ orderId: string }> {
  const t = target(io);
  if (!t.url) return { orderId: `LOCAL-${++localOrders}` };
  const body = await fetchJson(t.fetch, `${t.url}/api/orders`, {
    method: 'POST', headers: { 'x-erp-token': t.token, 'content-type': 'application/json' }, body: JSON.stringify(order),
  }, 'ERP', `ao criar o pedido da oportunidade ${order.opportunityId}`);
  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) throw new Error(`ERP não devolveu o número do pedido da oportunidade ${order.opportunityId}`);
  return { orderId: parsed.data.orderId };
}
