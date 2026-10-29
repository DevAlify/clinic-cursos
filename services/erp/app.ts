import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { CATALOG, findOffer } from '../../src/erp/catalog.ts';
import { safeEqual } from '../../src/gateway/signature.ts';
import { erpEnv } from '../shared/env.ts';

// Same shape the core accepts at POST /webhooks/erp (see src/gateway/erp.ts).
export interface SaleConfirmed {
  type: 'sale_confirmed'; saleId: string; confirmedAt: string; opportunityId: string | null;
  product: string; unit: string; name?: string; phone?: string; email?: string;
}
export interface ErpDeps {
  notifyCore: (sale: SaleConfirmed) => Promise<void>;
  db?: Database.Database;
}

const orderSchema = z.object({
  opportunityId: z.string().min(1).max(100),
  product: z.string(),
  unit: z.string(),
  contact: z.object({ name: z.string().max(200).optional(), phone: z.string().max(40).optional(), email: z.string().max(200).optional() })
    .refine((c) => Boolean(c.phone || c.email), 'informe telefone ou e-mail'),
});

interface OrderRow {
  id: number; opportunity_id: string; product: string; unit: string; name: string | null; phone: string | null; email: string | null;
  status: 'pending_payment' | 'paid'; created_at: string; paid_at: string | null; sale_id: string | null; notified: number;
}

const orderCode = (n: number) => `ERP-ORD-${String(n).padStart(4, '0')}`;
// Sale ids start at 1001, the range the demo scenarios already use for the sale of the pre-enrolled lead.
const saleCode = (n: number) => `ERP-SALE-${1000 + n}`;
const parseOrderCode = (code: string): number | null => {
  const m = /^ERP-ORD-(\d+)$/.exec(code);
  return m ? Number(m[1]) : null;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS seats (product TEXT NOT NULL, unit TEXT NOT NULL, seats_left INTEGER NOT NULL, PRIMARY KEY (product, unit));
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id TEXT NOT NULL, product TEXT NOT NULL, unit TEXT NOT NULL,
  name TEXT, phone TEXT, email TEXT,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  created_at TEXT NOT NULL, paid_at TEXT, sale_id TEXT,
  notified INTEGER NOT NULL DEFAULT 0
);`;

export function createErpApp({ notifyCore, db = new Database(':memory:') }: ErpDeps) {
  const { token } = erpEnv();
  db.exec(SCHEMA);
  const seed = db.prepare('INSERT OR IGNORE INTO seats (product, unit, seats_left) VALUES (?, ?, ?)');
  for (const c of CATALOG) seed.run(c.product, c.unit, c.seatsLeft);
  const page = readFileSync(join(import.meta.dirname, 'public', 'index.html'), 'utf8');

  const catalog = () => {
    const left = db.prepare('SELECT product, unit, seats_left AS seatsLeft FROM seats').all() as { product: string; unit: string; seatsLeft: number }[];
    return CATALOG.map((c) => ({ ...c, seatsLeft: left.find((s) => s.product === c.product && s.unit === c.unit)?.seatsLeft ?? 0 }));
  };
  const seatsLeft = (product: string, unit: string) =>
    (db.prepare('SELECT seats_left AS n FROM seats WHERE product = ? AND unit = ?').get(product, unit) as { n: number } | undefined)?.n ?? 0;
  const getOrder = (id: number) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow | undefined;
  // Phone and e-mail stay in the ERP and go to the core only in the sale notice; the list shows who bought, nothing more.
  const view = (o: OrderRow) => ({
    orderId: orderCode(o.id), opportunityId: o.opportunity_id, product: o.product, unit: o.unit, name: o.name,
    status: o.status, createdAt: o.created_at, paidAt: o.paid_at, saleId: o.sale_id,
  });

  const app = new Hono();
  app.use('/api/*', bodyLimit({ maxSize: 100 * 1024, onError: (c) => c.json({ error: 'corpo grande demais' }, 413) }));

  app.get('/', (c) => c.html(page));
  app.get('/api/catalog', (c) => c.json(catalog()));
  app.get('/api/orders', (c) => c.json((db.prepare('SELECT * FROM orders ORDER BY id DESC').all() as OrderRow[]).map(view)));

  app.post('/api/orders', async (c) => {
    if (!safeEqual(c.req.header('x-erp-token') ?? '', token)) return c.json({ error: 'token inválido' }, 401);
    const parsed = orderSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'pedido inválido', details: parsed.error.issues.map((i) => i.message) }, 400);
    const { opportunityId, product, unit, contact } = parsed.data;
    if (!findOffer(product, unit)) return c.json({ error: `curso desconhecido: ${product} em ${unit}` }, 400);
    if (seatsLeft(product, unit) <= 0) return c.json({ error: `sem vagas em ${product} (${unit})` }, 409);
    const r = db.prepare('INSERT INTO orders (opportunity_id, product, unit, name, phone, email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(opportunityId, product, unit, contact.name ?? null, contact.phone ?? null, contact.email ?? null, new Date().toISOString());
    const orderId = orderCode(Number(r.lastInsertRowid));
    console.log(`erp: pedido ${orderId} criado para a oportunidade ${opportunityId}`);
    return c.json({ orderId, status: 'pending_payment' }, 201);
  });

  app.post('/api/orders/:id/pay', async (c) => {
    const n = parseOrderCode(c.req.param('id'));
    let order = n === null ? undefined : getOrder(n);
    if (!order) return c.json({ error: 'pedido não encontrado' }, 404);
    if (order.status === 'paid' && order.notified) return c.json({ error: 'pedido já pago' }, 409);

    if (order.status === 'pending_payment') {
      const { id, product, unit } = order;
      const pay = db.transaction(() => {
        const took = db.prepare('UPDATE seats SET seats_left = seats_left - 1 WHERE product = ? AND unit = ? AND seats_left > 0').run(product, unit);
        if (took.changes === 0) return false;
        db.prepare("UPDATE orders SET status = 'paid', paid_at = ?, sale_id = ? WHERE id = ?").run(new Date().toISOString(), saleCode(id), id);
        return true;
      });
      if (!pay()) return c.json({ error: `sem vagas em ${product} (${unit}); o pagamento não foi registrado` }, 409);
      order = getOrder(id)!;
    }

    // The payment is already stored. If the core is down, the same call again only repeats the notice (the core drops duplicates by sale id).
    const sale: SaleConfirmed = {
      type: 'sale_confirmed', saleId: order.sale_id!, confirmedAt: order.paid_at!, opportunityId: order.opportunity_id,
      product: order.product, unit: order.unit,
      ...(order.name ? { name: order.name } : {}), ...(order.phone ? { phone: order.phone } : {}), ...(order.email ? { email: order.email } : {}),
    };
    try {
      await notifyCore(sale);
    } catch (e) {
      console.error(`erp: pedido ${orderCode(order.id)} pago, mas o aviso da venda ${sale.saleId} ao core falhou: ${e instanceof Error ? e.message : String(e)}`);
      return c.json({ error: 'pagamento registrado, mas o core não recebeu o aviso; confirme de novo para reenviar', orderId: orderCode(order.id), saleId: sale.saleId }, 502);
    }
    db.prepare('UPDATE orders SET notified = 1 WHERE id = ?').run(order.id);
    console.log(`erp: venda ${sale.saleId} do pedido ${orderCode(order.id)} avisada ao core`);
    return c.json({ orderId: orderCode(order.id), status: 'paid', saleId: sale.saleId, seatsLeft: seatsLeft(order.product, order.unit) });
  });

  return app;
}
