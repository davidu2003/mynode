import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

const CYCLE_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  'semi-annually': 6,
  annually: 12,
  yearly: 12,
  biennially: 24,
  triennially: 36,
};

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return new Date(numeric * 1000);
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const addMonths = (date: Date, months: number) => {
  const base = new Date(date);
  const day = base.getDate();
  base.setDate(1);
  base.setMonth(base.getMonth() + months);
  const daysInMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  base.setDate(Math.min(day, daysInMonth));
  return base;
};

const addDays = (date: Date, days: number) => {
  const base = new Date(date);
  base.setDate(base.getDate() + days);
  return base;
};

export const runBillingAutoRenew = () => {
  const now = new Date();
  const billings = db
    .select()
    .from(schema.vpsBilling)
    .where(eq(schema.vpsBilling.autoRenew, true))
    .all();

  for (const billing of billings) {
    const expireDate = toDate(billing.expireDate);
    if (!expireDate) continue;
    if (expireDate > now) continue;

    const cycleDays = billing.cycleDays || null;
    const cycleMonths = billing.billingCycle
      ? CYCLE_MONTHS[String(billing.billingCycle).toLowerCase()] || null
      : null;

    if (!cycleDays && !cycleMonths) continue;

    let startDate = toDate(billing.startDate) || expireDate;
    let nextExpire = new Date(expireDate);

    while (nextExpire <= now) {
      startDate = new Date(nextExpire);
      nextExpire = cycleDays
        ? addDays(nextExpire, cycleDays)
        : addMonths(nextExpire, cycleMonths || 0);
    }

    db.update(schema.vpsBilling)
      .set({
        startDate,
        expireDate: nextExpire,
      })
      .where(eq(schema.vpsBilling.id, billing.id))
      .run();

    db.insert(schema.auditLogs).values({
      action: 'billing_autorenew',
      targetType: 'vps',
      targetId: billing.vpsId,
      details: JSON.stringify({
        billingId: billing.id,
        startDate: startDate.toISOString(),
        expireDate: nextExpire.toISOString(),
      }),
      ip: 'system',
      createdAt: new Date(),
    }).run();
  }
};

export const startBillingAutoRenew = (intervalMs: number) => {
  runBillingAutoRenew();
  return setInterval(runBillingAutoRenew, intervalMs);
};
