import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as softwareService from '../services/software.service.js';

const createSoftwareSchema = z.object({
  name: z.string().min(1).max(100),
  displayName: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  installMethod: z.enum(['script', 'command', 'apt', 'yum']),
  installScript: z.string().min(1),
  uninstallScript: z.string().nullable().optional(),
  checkCommand: z.string().nullable().optional(),
  versionCommand: z.string().nullable().optional(),
  serviceName: z.string().nullable().optional(),
  configPath: z.string().nullable().optional(),
  configContent: z.string().nullable().optional(),
  serviceConfigContent: z.string().nullable().optional(),
});

const updateSoftwareSchema = createSoftwareSchema.partial();

const installSchema = z.object({
  vpsIds: z.array(z.number().int()),
});

const serviceActionSchema = z.object({
  action: z.enum(['start', 'stop', 'restart']),
});

const configUpdateSchema = z.object({
  content: z.string(),
});

export const softwareController = {
  async list(_request: FastifyRequest, _reply: FastifyReply) {
    return softwareService.getSoftwareList();
  },

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const software = softwareService.getSoftwareById(parseInt(id, 10));

    if (!software) {
      return reply.status(404).send({ error: 'Software not found' });
    }

    return software;
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const body = createSoftwareSchema.parse(request.body);
    const result = softwareService.createSoftware(body, request.ip);

    if (result.error) {
      return reply.status(400).send({ error: result.error });
    }

    return result.software;
  },

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = updateSoftwareSchema.parse(request.body);

    const result = softwareService.updateSoftware(parseInt(id, 10), body, request.ip);

    if (!result.success) {
      const status = result.error === 'Software not found' ? 404 : 400;
      return reply.status(status).send({ error: result.error });
    }

    return { success: true };
  },

  async delete(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };

    const result = softwareService.deleteSoftware(parseInt(id, 10), request.ip);

    if (!result.success) {
      return reply.status(404).send({ error: result.error });
    }

    return { success: true };
  },

  async installBase(request: FastifyRequest, reply: FastifyReply) {
    const { vpsIds } = installSchema.parse(request.body);

    if (!vpsIds || vpsIds.length === 0) {
      return reply.status(400).send({ error: 'vpsIds is required' });
    }

    return softwareService.installBaseSoftware(vpsIds);
  },

  async install(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { vpsIds } = installSchema.parse(request.body);

    const result = await softwareService.installSoftware(parseInt(id, 10), vpsIds, request.ip);

    if ('error' in result) {
      return reply.status(404).send({ error: result.error });
    }

    return result;
  },

  async uninstall(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { vpsIds } = installSchema.parse(request.body);

    const result = await softwareService.uninstallSoftware(parseInt(id, 10), vpsIds, request.ip);

    if ('error' in result) {
      const status = result.error === 'Software not found' ? 404 : 400;
      return reply.status(status).send({ error: result.error });
    }

    return result;
  },

  async getStatus(request: FastifyRequest, reply: FastifyReply) {
    const { id, vpsId } = request.params as { id: string; vpsId: string };

    const software = softwareService.getSoftwareById(parseInt(id, 10));
    if (!software) {
      return reply.status(404).send({ error: 'Software not found' });
    }

    return softwareService.getInstallationStatus(parseInt(id, 10), parseInt(vpsId, 10));
  },

  async getServiceStatus(request: FastifyRequest, reply: FastifyReply) {
    const { id, vpsId } = request.params as { id: string; vpsId: string };

    const result = await softwareService.getServiceStatus(parseInt(id, 10), parseInt(vpsId, 10));

    if ('error' in result) {
      const status = result.error === 'Software not found' ? 404 :
                     result.error === 'Agent not connected' ? 503 : 400;
      return reply.status(status).send({ error: result.error });
    }

    return result;
  },

  async controlService(request: FastifyRequest, reply: FastifyReply) {
    const { id, vpsId } = request.params as { id: string; vpsId: string };
    const body = serviceActionSchema.parse(request.body);

    const result = await softwareService.controlService(parseInt(id, 10), parseInt(vpsId, 10), body.action);

    if (!result.success) {
      const status = result.error === 'Software not found' ? 404 :
                     result.error === 'Agent not connected' ? 503 : 500;
      return reply.status(status).send({ error: result.error });
    }

    return { success: true };
  },

  async getConfig(request: FastifyRequest, reply: FastifyReply) {
    const { id, vpsId } = request.params as { id: string; vpsId: string };

    const result = await softwareService.getConfig(parseInt(id, 10), parseInt(vpsId, 10));

    if ('error' in result) {
      const status = result.error === 'Software not found' ? 404 :
                     result.error === 'Agent not connected' ? 503 : 400;
      return reply.status(status).send({ error: result.error });
    }

    return result;
  },

  async updateConfig(request: FastifyRequest, reply: FastifyReply) {
    const { id, vpsId } = request.params as { id: string; vpsId: string };
    const body = configUpdateSchema.parse(request.body);

    const result = await softwareService.updateConfig(parseInt(id, 10), parseInt(vpsId, 10), body.content);

    if (!result.success) {
      const status = result.error === 'Software not found' ? 404 :
                     result.error === 'Agent not connected' ? 503 : 500;
      return reply.status(status).send({ error: result.error });
    }

    return { success: true };
  },

  async refreshAll(_request: FastifyRequest, _reply: FastifyReply) {
    return softwareService.refreshAllInstallations();
  },

  async getInstallations(request: FastifyRequest, _reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const query = request.query as {
      page?: string;
      pageSize?: string;
      vpsId?: string;
    };

    const page = parseInt(query.page || '1', 10);
    const pageSize = parseInt(query.pageSize || '20', 10);
    const vpsId = query.vpsId ? parseInt(query.vpsId, 10) : undefined;

    return softwareService.getInstallations(parseInt(id, 10), { page, pageSize, vpsId });
  },
};
