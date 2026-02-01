import { FastifyPluginAsync } from 'fastify';
import { createReadStream, promises as fs } from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { buildInstallScript } from '../services/agent-install.js';

const allowedFiles = new Set([
  'mynode-agent-linux-amd64',
  'mynode-agent-linux-arm64',
]);

export const agentDownloadRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/install.sh', async (_request, reply) => {
    reply.type('text/x-shellscript');
    return buildInstallScript();
  });

  fastify.get('/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };

    if (!allowedFiles.has(filename)) {
      return reply.status(404).send({ error: 'Not found' });
    }

    const filePath = path.resolve(config.agentBinaryDir, filename);
    try {
      await fs.access(filePath);
    } catch {
      return reply.status(404).send({ error: 'Agent binary not found' });
    }

    reply.type('application/octet-stream');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(createReadStream(filePath));
  });
};
