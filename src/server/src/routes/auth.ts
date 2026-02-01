import { FastifyPluginAsync } from 'fastify';
import { authController } from '../controllers/auth.controller.js';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Check if initialization is needed
  fastify.get('/status', authController.getStatus);

  // Initialize admin account (first time only)
  fastify.post('/setup', authController.setup);

  // Login
  fastify.post('/login', (request, reply) => authController.login(request, reply, fastify));

  // Logout
  fastify.post('/logout', authController.logout);

  // Verify login status
  fastify.get('/me', authController.me);

  // Change password
  fastify.post('/change-password', authController.changePassword);
};
