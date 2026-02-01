import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as vpsService from '../services/vps.service.js';

const createVpsSchema = z.object({
  name: z.string().min(1).max(100),
  ip: z.string().min(1),
  sshPort: z.number().int().min(1).max(65535).default(22),
  authType: z.enum(['password', 'key']),
  authCredential: z.string().min(1),
  saveCredential: z.boolean().default(false),
  logo: z.string().optional(),
  vendorUrl: z.string().url().optional().or(z.literal('')),
  groupId: z.number().int().optional(),
  groupIds: z.array(z.number().int()).optional(),
  tagIds: z.array(z.number().int()).optional(),
  billing: z.object({
    currency: z.string().default('USD'),
    amount: z.number().min(0),
    bandwidth: z.string().optional(),
    traffic: z.string().optional(),
    trafficGb: z.number().min(0).optional(),
    trafficCycle: z.string().optional(),
    route: z.string().optional(),
    billingCycle: z.string(),
    cycleDays: z.number().int().optional(),
    startDate: z.string(),
    expireDate: z.string(),
    autoRenew: z.boolean().default(false),
  }).optional(),
});

const updateVpsSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  ip: z.string().min(1).optional(),
  sshPort: z.number().int().min(1).max(65535).optional(),
  logo: z.string().optional(),
  vendorUrl: z.string().url().optional().or(z.literal('')),
  groupId: z.number().int().optional(),
  groupIds: z.array(z.number().int()).optional(),
  tagIds: z.array(z.number().int()).optional(),
  billing: z.object({
    currency: z.string().default('USD'),
    amount: z.number().min(0),
    bandwidth: z.string().optional(),
    traffic: z.string().optional(),
    trafficGb: z.number().min(0).optional(),
    trafficCycle: z.string().optional(),
    route: z.string().optional(),
    billingCycle: z.string(),
    cycleDays: z.number().int().optional(),
    startDate: z.string(),
    expireDate: z.string(),
    autoRenew: z.boolean().default(false),
  }).optional(),
});

const installAgentSchema = z.object({
  authType: z.enum(['password', 'key']).optional(),
  authCredential: z.string().optional(),
});

export const vpsController = {
  async list(request: FastifyRequest, _reply: FastifyReply) {
    const query = request.query as {
      page?: string;
      pageSize?: string;
      groupId?: string;
      status?: string;
      search?: string;
    };

    const page = parseInt(query.page || '1', 10);
    const pageSize = parseInt(query.pageSize || '20', 10);

    return vpsService.getVpsList({
      page,
      pageSize,
      groupId: query.groupId ? parseInt(query.groupId, 10) : undefined,
      status: query.status,
      search: query.search,
    });
  },

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const vps = vpsService.getVpsById(parseInt(id, 10));

    if (!vps) {
      return reply.status(404).send({ error: 'VPS not found' });
    }

    return vps;
  },

  async create(request: FastifyRequest, _reply: FastifyReply) {
    const body = createVpsSchema.parse(request.body);
    return vpsService.createVps(body, request.ip, request);
  },

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = updateVpsSchema.parse(request.body);

    const result = vpsService.updateVps(parseInt(id, 10), body, request.ip);

    if (!result.success) {
      return reply.status(404).send({ error: result.error });
    }

    return { success: true };
  },

  async delete(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };

    const result = vpsService.deleteVps(parseInt(id, 10), request.ip);

    if (!result.success) {
      return reply.status(404).send({ error: result.error });
    }

    return { success: true };
  },

  async resetToken(request: FastifyRequest, _reply: FastifyReply) {
    const { id } = request.params as { id: string };
    return vpsService.resetToken(parseInt(id, 10));
  },

  async installAgent(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = installAgentSchema.parse(request.body || {});

    const result = await vpsService.installAgent(
      parseInt(id, 10),
      body,
      request.ip,
      request
    );

    if (result.error && result.status === 'error') {
      if (result.requireCredential) {
        return reply.status(400).send({
          error: 'SSH credential required',
          message: '需要提供SSH认证信息才能重装Agent',
          requireCredential: true,
        });
      }
      const status = result.error === 'VPS not found' ? 404 : 500;
      return reply.status(status).send({ error: result.error });
    }

    return { status: result.status, method: result.method };
  },

  async exec(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { command, timeout } = request.body as { command: string; timeout?: number };

    if (!command || typeof command !== 'string') {
      return reply.status(400).send({ error: '请输入命令' });
    }

    const result = await vpsService.execCommand(
      parseInt(id, 10),
      command,
      timeout || 60000,
      request.ip
    );

    if ('error' in result) {
      const status = result.error === 'VPS not found' ? 404 :
                     result.error === 'Agent不在线' ? 400 : 500;
      return reply.status(status).send({ error: result.error });
    }

    return result;
  },

  async hasCredential(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const result = vpsService.hasCredential(parseInt(id, 10));

    if (!result) {
      return reply.status(404).send({ error: 'VPS not found' });
    }

    return result;
  },

  async getCredential(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const result = vpsService.getCredential(parseInt(id, 10));

    if (!result) {
      return reply.status(404).send({ error: 'VPS not found' });
    }

    return result;
  },

  async getMetrics(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const query = request.query as { limit?: string; since?: string };

    const limit = Math.min(parseInt(query.limit || '60', 10), 20000);
    const sinceMs = query.since ? Date.parse(query.since) : NaN;
    const since = Number.isNaN(sinceMs) ? null : new Date(sinceMs);

    const result = vpsService.getMetrics(parseInt(id, 10), { limit, since });

    if (!result) {
      return reply.status(404).send({ error: 'VPS not found' });
    }

    return result;
  },

  async getPingMonitors(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };

    const result = vpsService.getPingMonitors(parseInt(id, 10));

    if (!result) {
      return reply.status(404).send({ error: 'VPS not found' });
    }

    return result;
  },

  async getPingResults(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const query = request.query as { monitorId?: string; limit?: string; since?: string };

    const monitorId = parseInt(query.monitorId || '0', 10);
    if (!monitorId) {
      return reply.status(400).send({ error: 'monitorId required' });
    }

    const limit = Math.min(parseInt(query.limit || '120', 10), 20000);
    const sinceMs = query.since ? Date.parse(query.since) : NaN;
    const since = Number.isNaN(sinceMs) ? null : new Date(sinceMs);

    const result = vpsService.getPingResults(parseInt(id, 10), monitorId, { limit, since });

    if (!result) {
      return reply.status(404).send({ error: 'Monitor not found' });
    }

    return result;
  },
};
