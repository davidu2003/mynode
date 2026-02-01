import { FastifyPluginAsync } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

export const agentRoutes: FastifyPluginAsync = async (fastify) => {
  // Agent注册验证（用于Agent首次连接时验证Token）
  fastify.post('/verify', async (request, reply) => {
    const { token } = request.body as { token: string };

    if (!token) {
      return reply.status(400).send({ error: 'Token required' });
    }

    const vpsItem = db
      .select()
      .from(schema.vps)
      .where(eq(schema.vps.agentToken, token))
      .get();

    if (!vpsItem) {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    return {
      vpsId: vpsItem.id,
      name: vpsItem.name,
    };
  });

  // Agent上报系统信息
  fastify.post('/system-info', async (request, reply) => {
    const { token, systemInfo } = request.body as {
      token: string;
      systemInfo: {
        osType: string;
        osVersion: string;
        arch: string;
        hostname: string;
        kernel: string;
        cpu?: {
          model?: string;
          cores?: number;
          threads?: number;
        };
        memory?: {
          total?: number;
          available?: number;
        };
        disks?: any[];
        networks?: any[];
      };
    };

    const vpsItem = db
      .select()
      .from(schema.vps)
      .where(eq(schema.vps.agentToken, token))
      .get();

    if (!vpsItem) {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    db.update(schema.vps)
      .set({
        osType: systemInfo.osType,
        osVersion: systemInfo.osVersion,
        arch: systemInfo.arch,
        agentStatus: 'online',
        updatedAt: new Date(),
      })
      .where(eq(schema.vps.id, vpsItem.id))
      .run();

    const systemInfoRecord = {
      vpsId: vpsItem.id,
      hostname: systemInfo.hostname || null,
      kernel: systemInfo.kernel || null,
      cpuModel: systemInfo.cpu?.model || null,
      cpuCores: systemInfo.cpu?.cores || null,
      cpuThreads: systemInfo.cpu?.threads || null,
      memTotal: systemInfo.memory?.total || null,
      memAvailable: systemInfo.memory?.available || null,
      disks: systemInfo.disks ? JSON.stringify(systemInfo.disks) : null,
      networks: systemInfo.networks ? JSON.stringify(systemInfo.networks) : null,
      updatedAt: new Date(),
    };

    const existing = db
      .select()
      .from(schema.vpsSystemInfo)
      .where(eq(schema.vpsSystemInfo.vpsId, vpsItem.id))
      .get();

    if (existing) {
      db.update(schema.vpsSystemInfo)
        .set(systemInfoRecord)
        .where(eq(schema.vpsSystemInfo.id, existing.id))
        .run();
    } else {
      db.insert(schema.vpsSystemInfo).values(systemInfoRecord).run();
    }

    return { success: true };
  });

  // Agent上报监控指标
  fastify.post('/metrics', async (request, reply) => {
    const { token, metrics } = request.body as {
      token: string;
      metrics: {
        cpuUsage: number;
        memUsage: number;
        diskUsage: number;
        netIn: number;
        netOut: number;
        diskReadBytes?: number;
        diskWriteBytes?: number;
        load1: number;
        load5: number;
        load15: number;
      };
    };

    const vpsItem = db
      .select()
      .from(schema.vps)
      .where(eq(schema.vps.agentToken, token))
      .get();

    if (!vpsItem) {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    db.insert(schema.metrics).values({
      vpsId: vpsItem.id,
      cpuUsage: metrics.cpuUsage,
      memUsage: metrics.memUsage,
      diskUsage: metrics.diskUsage,
      netIn: metrics.netIn,
      netOut: metrics.netOut,
      diskReadBytes: metrics.diskReadBytes || null,
      diskWriteBytes: metrics.diskWriteBytes || null,
      load1: metrics.load1,
      load5: metrics.load5,
      load15: metrics.load15,
      collectedAt: new Date(),
    }).run();

    return { success: true };
  });

  // Agent上报Ping结果
  fastify.post('/ping-result', async (request, reply) => {
    const { token, results } = request.body as {
      token: string;
      results: Array<{
        monitorId: number;
        success: boolean;
        latency?: number;
        error?: string;
      }>;
    };

    const vpsItem = db
      .select()
      .from(schema.vps)
      .where(eq(schema.vps.agentToken, token))
      .get();

    if (!vpsItem) {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    const now = new Date();
    for (const result of results) {
      db.insert(schema.pingResults).values({
        monitorId: result.monitorId,
        success: result.success,
        latency: result.latency || null,
        error: result.error || null,
        collectedAt: now,
      }).run();
    }

    return { success: true };
  });
};
