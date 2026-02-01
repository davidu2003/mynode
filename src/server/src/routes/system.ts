import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { eq, desc, asc, sql, lt } from 'drizzle-orm';
import { config } from '../config/index.js';
import { sendPingConfig, restartAgentOfflineChecker } from '../websocket/agent.js';

async function authenticate(request: any, reply: any) {
  try {
    await request.jwtVerify();
  } catch {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}

export const systemRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // 获取系统设置
  fastify.get('/settings', async () => {
    const settings = db.select().from(schema.systemSettings).all();
    const result: Record<string, any> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }
    return result;
  });

  // 更新系统设置
  fastify.put('/settings/:key', async (request) => {
    const { key } = request.params as { key: string };
    const { value } = request.body as { value: any };

    const existing = db
      .select()
      .from(schema.systemSettings)
      .where(eq(schema.systemSettings.key, key))
      .get();

    if (existing) {
      db.update(schema.systemSettings)
        .set({ value: JSON.stringify(value) })
        .where(eq(schema.systemSettings.id, existing.id))
        .run();
    } else {
      db.insert(schema.systemSettings).values({
        key,
        value: JSON.stringify(value),
      }).run();
    }

    // 如果更新的是 Agent 检查配置，重启检查器
    if (key === 'agentCheckConfig') {
      restartAgentOfflineChecker();
    }

    return { success: true };
  });

  // 获取 Agent 在线检查配置
  fastify.get('/agent-check-config', async () => {
    const setting = db
      .select()
      .from(schema.systemSettings)
      .where(eq(schema.systemSettings.key, 'agentCheckConfig'))
      .get();

    if (setting?.value) {
      try {
        const parsed = JSON.parse(setting.value);
        return {
          checkInterval: parsed.checkInterval || 30, // 秒
          offlineThreshold: parsed.offlineThreshold || 90, // 秒
        };
      } catch {
        // 解析失败返回默认值
      }
    }

    return {
      checkInterval: 30,
      offlineThreshold: 90,
    };
  });

  // 更新 Agent 在线检查配置
  fastify.put('/agent-check-config', async (request, reply) => {
    const configSchema = z.object({
      checkInterval: z.number().int().min(5).max(300), // 5-300 秒
      offlineThreshold: z.number().int().min(10).max(600), // 10-600 秒
    });

    const body = request.body as { checkInterval?: number; offlineThreshold?: number };
    const parsed = configSchema.safeParse(body);

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid config', details: parsed.error.errors });
    }

    const { checkInterval, offlineThreshold } = parsed.data;

    // 阈值必须大于检查间隔
    if (offlineThreshold <= checkInterval) {
      return reply.status(400).send({ error: 'offlineThreshold must be greater than checkInterval' });
    }

    const existing = db
      .select()
      .from(schema.systemSettings)
      .where(eq(schema.systemSettings.key, 'agentCheckConfig'))
      .get();

    const value = JSON.stringify({ checkInterval, offlineThreshold });

    if (existing) {
      db.update(schema.systemSettings)
        .set({ value })
        .where(eq(schema.systemSettings.id, existing.id))
        .run();
    } else {
      db.insert(schema.systemSettings).values({
        key: 'agentCheckConfig',
        value,
      }).run();
    }

    // 重启 Agent 检查器以应用新配置
    restartAgentOfflineChecker();

    return { success: true, checkInterval, offlineThreshold };
  });

  // 获取审计日志
  fastify.get('/audit-logs', async (request) => {
    const query = request.query as { page?: string; pageSize?: string };
    const page = parseInt(query.page || '1', 10);
    const pageSize = parseInt(query.pageSize || '50', 10);

    const items = db
      .select()
      .from(schema.auditLogs)
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all();

    const totalResult = db
      .select({ count: sql<number>`count(*)` })
      .from(schema.auditLogs)
      .get();

    return {
      total: totalResult?.count || 0,
      page,
      pageSize,
      items,
    };
  });

  // 获取VPS分组
  fastify.get('/groups', async () => {
    const groups = db.select().from(schema.vpsGroups).all();
    return { items: groups };
  });

  // 创建VPS分组
  fastify.post('/groups', async (request) => {
    const { name, description } = request.body as { name: string; description?: string };

    const result = db.insert(schema.vpsGroups).values({
      name,
      description: description || null,
      createdAt: new Date(),
    }).run();

    return { id: Number(result.lastInsertRowid), name };
  });

  // 更新VPS分组
  fastify.put('/groups/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name, description } = request.body as { name: string; description?: string };
    if (!name) {
      return reply.status(400).send({ error: 'Name required' });
    }

    const existing = db
      .select()
      .from(schema.vpsGroups)
      .where(eq(schema.vpsGroups.id, parseInt(id, 10)))
      .get();
    if (!existing) {
      return reply.status(404).send({ error: 'Group not found' });
    }

    db.update(schema.vpsGroups)
      .set({ name, description: description || null })
      .where(eq(schema.vpsGroups.id, parseInt(id, 10)))
      .run();

    return { success: true };
  });

  // 获取分组下的服务器
  fastify.get('/groups/:id/vps', async (request, reply) => {
    const { id } = request.params as { id: string };
    const groupId = parseInt(id, 10);
    if (!groupId) {
      return reply.status(400).send({ error: 'Invalid group id' });
    }

    const members = db
      .select({
        id: schema.vps.id,
        name: schema.vps.name,
        ip: schema.vps.ip,
        agentStatus: schema.vps.agentStatus,
      })
      .from(schema.vpsGroupMembers)
      .innerJoin(schema.vps, eq(schema.vpsGroupMembers.vpsId, schema.vps.id))
      .where(eq(schema.vpsGroupMembers.groupId, groupId))
      .all();

    const legacyMembers = db
      .select({
        id: schema.vps.id,
        name: schema.vps.name,
        ip: schema.vps.ip,
        agentStatus: schema.vps.agentStatus,
      })
      .from(schema.vps)
      .where(eq(schema.vps.groupId, groupId))
      .all()
      .filter((item) => !members.find((member) => member.id === item.id));

    return { items: [...members, ...legacyMembers] };
  });

  // 更新分组服务器
  fastify.put('/groups/:id/vps', async (request, reply) => {
    const { id } = request.params as { id: string };
    const groupId = parseInt(id, 10);
    if (!groupId) {
      return reply.status(400).send({ error: 'Invalid group id' });
    }
    const body = request.body as { vpsIds?: number[] };
    const vpsIds = (body.vpsIds || []).filter((value) => Number.isInteger(value));

    db.delete(schema.vpsGroupMembers)
      .where(eq(schema.vpsGroupMembers.groupId, groupId))
      .run();

    for (const vpsId of vpsIds) {
      db.insert(schema.vpsGroupMembers).values({ vpsId, groupId }).run();
      const existing = db.select().from(schema.vps).where(eq(schema.vps.id, vpsId)).get();
      if (existing && !existing.groupId) {
        db.update(schema.vps)
          .set({ groupId })
          .where(eq(schema.vps.id, vpsId))
          .run();
      }
    }

    if (vpsIds.length === 0) {
      db.update(schema.vps)
        .set({ groupId: null })
        .where(eq(schema.vps.groupId, groupId))
        .run();
    }

    return { success: true };
  });

  // 删除VPS分组
  fastify.delete('/groups/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    // 将该组的VPS移到未分组
    db.update(schema.vps)
      .set({ groupId: null })
      .where(eq(schema.vps.groupId, parseInt(id, 10)))
      .run();

    db.delete(schema.vpsGroupMembers)
      .where(eq(schema.vpsGroupMembers.groupId, parseInt(id, 10)))
      .run();

    db.delete(schema.vpsGroups)
      .where(eq(schema.vpsGroups.id, parseInt(id, 10)))
      .run();

    return { success: true };
  });

  // 获取标签
  fastify.get('/tags', async () => {
    const tags = db.select().from(schema.tags).all();
    return { items: tags };
  });

  // 创建标签
  fastify.post('/tags', async (request) => {
    const { name, color } = request.body as { name: string; color?: string };

    const result = db.insert(schema.tags).values({
      name,
      color: color || '#1890ff',
    }).run();

    return { id: Number(result.lastInsertRowid), name, color };
  });

  // 更新标签
  fastify.put('/tags/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name, color } = request.body as { name: string; color?: string };
    if (!name) {
      return reply.status(400).send({ error: 'Name required' });
    }

    const existing = db
      .select()
      .from(schema.tags)
      .where(eq(schema.tags.id, parseInt(id, 10)))
      .get();
    if (!existing) {
      return reply.status(404).send({ error: 'Tag not found' });
    }

    db.update(schema.tags)
      .set({ name, color: color || '#1890ff' })
      .where(eq(schema.tags.id, parseInt(id, 10)))
      .run();

    return { success: true };
  });

  // 删除标签
  fastify.delete('/tags/:id', async (request) => {
    const { id } = request.params as { id: string };
    db.delete(schema.tags).where(eq(schema.tags.id, parseInt(id, 10))).run();
    return { success: true };
  });

  // 清理过期数据
  fastify.post('/cleanup', async () => {
    const retentionMs = config.metricsRetentionDays * 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - retentionMs);

    // 清理监控指标
    const metricsResult = db
      .delete(schema.metrics)
      .where(lt(schema.metrics.collectedAt, cutoff))
      .run();

    // 清理Ping结果
    const pingResult = db
      .delete(schema.pingResults)
      .where(lt(schema.pingResults.collectedAt, cutoff))
      .run();

    // 清理登录尝试记录
    const loginResult = db
      .delete(schema.loginAttempts)
      .where(lt(schema.loginAttempts.attemptedAt, cutoff))
      .run();

    return {
      deleted: {
        metrics: metricsResult.changes,
        pingResults: pingResult.changes,
        loginAttempts: loginResult.changes,
      },
    };
  });

  // 系统概览统计
  fastify.get('/overview', async () => {
    const vpsTotal = db.select({ count: sql<number>`count(*)` }).from(schema.vps).get();
    const vpsOnline = db
      .select({ count: sql<number>`count(*)` })
      .from(schema.vps)
      .where(eq(schema.vps.agentStatus, 'online'))
      .get();
    const vpsOffline = db
      .select({ count: sql<number>`count(*)` })
      .from(schema.vps)
      .where(eq(schema.vps.agentStatus, 'offline'))
      .get();

    return {
      vps: {
        total: vpsTotal?.count || 0,
        online: vpsOnline?.count || 0,
        offline: vpsOffline?.count || 0,
      },
    };
  });

  // 获取最新监控指标
  fastify.get('/metrics/latest', async () => {
    const vpsList = db
      .select({
        id: schema.vps.id,
        name: schema.vps.name,
        ip: schema.vps.ip,
        agentStatus: schema.vps.agentStatus,
      })
      .from(schema.vps)
      .all();

    const toSec = (value: any) => {
      if (value instanceof Date) {
        return Math.floor(value.getTime() / 1000);
      }
      const num = Number(value || 0);
      return Number.isFinite(num) ? Math.floor(num) : 0;
    };

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStartSec = Math.floor(monthStart.getTime() / 1000);
    const dayStartSec = Math.floor(dayStart.getTime() / 1000);

    const items = vpsList.map((vps) => {
      const billing = db
        .select()
        .from(schema.vpsBilling)
        .where(eq(schema.vpsBilling.vpsId, vps.id))
        .get();

      const metric = db
        .select()
        .from(schema.metrics)
        .where(eq(schema.metrics.vpsId, vps.id))
        .orderBy(desc(schema.metrics.collectedAt))
        .limit(1)
        .get();

      const lastTwo = db
        .select()
        .from(schema.metrics)
        .where(eq(schema.metrics.vpsId, vps.id))
        .orderBy(desc(schema.metrics.collectedAt))
        .limit(2)
        .all();

      let speedInBps = 0;
      let speedOutBps = 0;
      if (lastTwo.length >= 2) {
        const curr = lastTwo[0];
        const prev = lastTwo[1];
        const dt = Math.max(toSec(curr.collectedAt) - toSec(prev.collectedAt), 1);
        const currIn = Number(curr.netIn || 0);
        const currOut = Number(curr.netOut || 0);
        const prevIn = Number(prev.netIn || 0);
        const prevOut = Number(prev.netOut || 0);
        speedInBps = Math.max((currIn - prevIn) / dt, 0);
        speedOutBps = Math.max((currOut - prevOut) / dt, 0);
      }

      const monthFirst = db
        .select()
        .from(schema.metrics)
        .where(sql`${schema.metrics.vpsId} = ${vps.id} AND ${schema.metrics.collectedAt} >= ${monthStartSec}`)
        .orderBy(asc(schema.metrics.collectedAt))
        .limit(1)
        .get();
      const monthLast = db
        .select()
        .from(schema.metrics)
        .where(sql`${schema.metrics.vpsId} = ${vps.id} AND ${schema.metrics.collectedAt} >= ${monthStartSec}`)
        .orderBy(desc(schema.metrics.collectedAt))
        .limit(1)
        .get();

      const dayFirst = db
        .select()
        .from(schema.metrics)
        .where(sql`${schema.metrics.vpsId} = ${vps.id} AND ${schema.metrics.collectedAt} >= ${dayStartSec}`)
        .orderBy(asc(schema.metrics.collectedAt))
        .limit(1)
        .get();
      const dayLast = db
        .select()
        .from(schema.metrics)
        .where(sql`${schema.metrics.vpsId} = ${vps.id} AND ${schema.metrics.collectedAt} >= ${dayStartSec}`)
        .orderBy(desc(schema.metrics.collectedAt))
        .limit(1)
        .get();

      let cycleUsedBytes = 0;
      if (billing?.startDate && (billing.cycleDays || billing.billingCycle || billing.trafficCycle)) {
        const startDate = billing.startDate instanceof Date
          ? billing.startDate
          : new Date(Number(billing.startDate) * 1000);
        let cycleDays = billing.cycleDays || null;
        if (!cycleDays) {
          const cycle = String(billing.trafficCycle || billing.billingCycle || '').toLowerCase();
          if (cycle === 'monthly') cycleDays = 30;
          if (cycle === 'quarterly') cycleDays = 90;
          if (cycle === 'yearly') cycleDays = 365;
        }
        if (cycleDays) {
          const elapsedDays = Math.max(
            Math.floor((now.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)),
            0
          );
          const cyclesPassed = Math.floor(elapsedDays / cycleDays);
          const cycleStart = new Date(startDate.getTime() + cyclesPassed * cycleDays * 24 * 60 * 60 * 1000);
          const cycleStartSec = Math.floor(cycleStart.getTime() / 1000);
          const cycleFirst = db
            .select()
            .from(schema.metrics)
            .where(sql`${schema.metrics.vpsId} = ${vps.id} AND ${schema.metrics.collectedAt} >= ${cycleStartSec}`)
            .orderBy(asc(schema.metrics.collectedAt))
            .limit(1)
            .get();
          const cycleLast = db
            .select()
            .from(schema.metrics)
            .where(sql`${schema.metrics.vpsId} = ${vps.id} AND ${schema.metrics.collectedAt} >= ${cycleStartSec}`)
            .orderBy(desc(schema.metrics.collectedAt))
            .limit(1)
            .get();
          if (cycleFirst && cycleLast) {
            cycleUsedBytes = Math.max(
              Number(cycleLast.netIn || 0) + Number(cycleLast.netOut || 0) -
              (Number(cycleFirst.netIn || 0) + Number(cycleFirst.netOut || 0)),
              0
            );
          }
        }
      }

      const monthUsedInBytes = monthFirst && monthLast
        ? Math.max(Number(monthLast.netIn || 0) - Number(monthFirst.netIn || 0), 0)
        : 0;
      const monthUsedOutBytes = monthFirst && monthLast
        ? Math.max(Number(monthLast.netOut || 0) - Number(monthFirst.netOut || 0), 0)
        : 0;
      const monthUsedBytes = monthUsedInBytes + monthUsedOutBytes;

      const dayUsedInBytes = dayFirst && dayLast
        ? Math.max(Number(dayLast.netIn || 0) - Number(dayFirst.netIn || 0), 0)
        : 0;
      const dayUsedOutBytes = dayFirst && dayLast
        ? Math.max(Number(dayLast.netOut || 0) - Number(dayFirst.netOut || 0), 0)
        : 0;
      const dayUsedBytes = dayUsedInBytes + dayUsedOutBytes;

      return {
        ...vps,
        metric: metric || null,
        speedInBps,
        speedOutBps,
        monthUsedBytes,
        monthUsedInBytes,
        monthUsedOutBytes,
        dayUsedBytes,
        dayUsedInBytes,
        dayUsedOutBytes,
        cycleUsedBytes,
      };
    });

    return { items };
  });

  // 获取网络监控配置
  fastify.get('/network-monitors', async () => {
    const setting = db
      .select()
      .from(schema.systemSettings)
      .where(eq(schema.systemSettings.key, 'networkMonitors'))
      .get();

    if (!setting?.value) {
      return { items: [] };
    }

    try {
      const parsed = JSON.parse(setting.value);
      return { items: Array.isArray(parsed) ? parsed : [] };
    } catch {
      return { items: [] };
    }
  });

  // 更新网络监控配置
  fastify.put('/network-monitors', async (request, reply) => {
    const monitorSchema = z.object({
      id: z.string().min(1),
      name: z.string().min(1).max(50),
      type: z.enum(['icmp', 'tcp']),
      target: z.string().min(1).max(200),
      interval: z.number().int().min(10),
      timeout: z.number().int().min(100).max(60000).default(5000),
      enabled: z.boolean().default(true),
    });
    const body = request.body as { items?: unknown };
    const items = z.array(monitorSchema).parse(body.items || []);

    const existing = db
      .select()
      .from(schema.systemSettings)
      .where(eq(schema.systemSettings.key, 'networkMonitors'))
      .get();

    if (existing) {
      db.update(schema.systemSettings)
        .set({ value: JSON.stringify(items) })
        .where(eq(schema.systemSettings.id, existing.id))
        .run();
    } else {
      db.insert(schema.systemSettings).values({
        key: 'networkMonitors',
        value: JSON.stringify(items),
      }).run();
    }

    return { success: true };
  });

  // 应用网络监控配置到指定服务器
  fastify.post('/network-monitors/apply', async (request, reply) => {
    const body = request.body as { vpsIds?: number[] };
    const vpsIds = (body.vpsIds || []).filter((id) => Number.isInteger(id));
    if (vpsIds.length === 0) {
      return reply.status(400).send({ error: 'vpsIds required' });
    }

    const setting = db
      .select()
      .from(schema.systemSettings)
      .where(eq(schema.systemSettings.key, 'networkMonitors'))
      .get();

    const monitors = setting?.value ? JSON.parse(setting.value) : [];
    if (!Array.isArray(monitors) || monitors.length === 0) {
      return reply.status(400).send({ error: 'No monitors configured' });
    }

    for (const vpsId of vpsIds) {
      db.delete(schema.pingMonitors)
        .where(eq(schema.pingMonitors.vpsId, vpsId))
        .run();

      for (const monitor of monitors) {
        let host = monitor.target;
        let port: number | null = null;
        if (monitor.type === 'tcp') {
          const match = String(monitor.target).split(':');
          if (match.length < 2) {
            return reply.status(400).send({ error: `Invalid target for tcp: ${monitor.target}` });
          }
          host = match.slice(0, -1).join(':');
          port = parseInt(match[match.length - 1], 10);
          if (!port || port <= 0) {
            return reply.status(400).send({ error: `Invalid port for tcp: ${monitor.target}` });
          }
        }

        db.insert(schema.pingMonitors).values({
          vpsId,
          name: monitor.name,
          target: host,
          port,
          type: monitor.type,
          interval: monitor.interval,
          timeout: monitor.timeout || 5000,
          enabled: monitor.enabled !== false,
          createdAt: new Date(),
        }).run();
      }

      sendPingConfig(vpsId);
    }

    return { success: true };
  });
};
