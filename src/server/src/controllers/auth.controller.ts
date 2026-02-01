import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as authService from '../services/auth.service.js';
import { config } from '../config/index.js';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const setupSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(8).max(128),
});

const changePasswordSchema = z.object({
  oldPassword: z.string(),
  newPassword: z.string().min(8),
});

export const authController = {
  async getStatus(_request: FastifyRequest, _reply: FastifyReply) {
    return {
      initialized: authService.isInitialized(),
    };
  },

  async setup(request: FastifyRequest, reply: FastifyReply) {
    const body = setupSchema.parse(request.body);
    const result = await authService.setupAdmin(body.username, body.password);

    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }

    return { success: true };
  },

  async login(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    const body = loginSchema.parse(request.body);
    const result = await authService.login(body.username, body.password, request.ip);

    if (!result.success) {
      const status = result.locked ? 429 : 401;
      return reply.status(status).send({ error: result.error });
    }

    const admin = result.admin!;
    const token = fastify.jwt.sign({ id: admin.id, username: admin.username });

    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: !config.isDev,
      sameSite: 'strict',
      maxAge: 86400,
    });

    return { success: true, username: admin.username };
  },

  async logout(request: FastifyRequest, reply: FastifyReply) {
    reply.clearCookie('token', { path: '/' });
    authService.logout(request.ip);
    return { success: true };
  },

  async me(request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
      const user = request.user as { id: number; username: string };
      return { authenticated: true, username: user.username };
    } catch {
      return reply.status(401).send({ authenticated: false });
    }
  },

  async changePassword(request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const user = request.user as { id: number };
    const body = changePasswordSchema.parse(request.body);

    const result = await authService.changePassword(user.id, body.oldPassword, body.newPassword);

    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }

    return { success: true };
  },
};
