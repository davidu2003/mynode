import { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { vpsController } from '../controllers/vps.controller.js';

export const vpsRoutes: FastifyPluginAsync = async (fastify) => {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  // VPS list
  fastify.get('/', vpsController.list);

  // Create VPS
  fastify.post('/', vpsController.create);

  // Get VPS details
  fastify.get('/:id', vpsController.getById);

  // Update VPS
  fastify.put('/:id', vpsController.update);

  // Delete VPS
  fastify.delete('/:id', vpsController.delete);

  // Reset Agent Token
  fastify.post('/:id/reset-token', vpsController.resetToken);

  // Reinstall Agent
  fastify.post('/:id/install-agent', vpsController.installAgent);

  // Execute command
  fastify.post('/:id/exec', vpsController.exec);

  // Check if VPS has saved SSH credentials
  fastify.get('/:id/has-credential', vpsController.hasCredential);

  // Get VPS SSH credentials (decrypted)
  fastify.get('/:id/credential', vpsController.getCredential);

  // Get VPS monitoring metrics
  fastify.get('/:id/metrics', vpsController.getMetrics);

  // Get VPS network monitoring configuration
  fastify.get('/:id/ping-monitors', vpsController.getPingMonitors);

  // Get VPS network monitoring results
  fastify.get('/:id/ping-results', vpsController.getPingResults);
};
