import { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { softwareController } from '../controllers/software.controller.js';

export const softwareRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // Get software list (with installation status for all servers)
  fastify.get('/', softwareController.list);

  // Install base software
  fastify.post('/install-base', softwareController.installBase);

  // Refresh all software installation status
  fastify.post('/refresh-all', softwareController.refreshAll);

  // Create software definition
  fastify.post('/', softwareController.create);

  // Get software details
  fastify.get('/:id', softwareController.getById);

  // Update software definition
  fastify.put('/:id', softwareController.update);

  // Delete software definition
  fastify.delete('/:id', softwareController.delete);

  // Install software to servers
  fastify.post('/:id/install', softwareController.install);

  // Uninstall software
  fastify.post('/:id/uninstall', softwareController.uninstall);

  // Get software installation status on specific server
  fastify.get('/:id/status/:vpsId', softwareController.getStatus);

  // Get software service running status
  fastify.get('/:id/service/:vpsId', softwareController.getServiceStatus);

  // Control software service
  fastify.post('/:id/service/:vpsId', softwareController.controlService);

  // Get software config file
  fastify.get('/:id/config/:vpsId', softwareController.getConfig);

  // Update software config file and restart service
  fastify.put('/:id/config/:vpsId', softwareController.updateConfig);

  // Get installation history
  fastify.get('/:id/installations', softwareController.getInstallations);
};
