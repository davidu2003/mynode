import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ddService, SUPPORTED_OS } from '../services/dd.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

async function authenticate(request: any, reply: any) {
  try {
    await request.jwtVerify();
  } catch {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}

const ddSchema = z.object({
  targetOs: z.enum(['debian', 'ubuntu', 'centos', 'rocky', 'alpine']),
  targetVersion: z.string(),
  newPassword: z.string().min(8, '密码至少8个字符'),
  newSshPort: z.coerce.number().int().min(1).max(65535).default(22),
});

export const ddRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // 获取支持的操作系统列表
  fastify.get('/supported-os', async () => {
    return SUPPORTED_OS;
  });

  // 开始DD重装
  fastify.post('/:vpsId/start', async (request, reply) => {
    const { vpsId } = request.params as { vpsId: string };
    const { force } = request.query as { force?: string };
    const body = ddSchema.parse(request.body);

    const id = parseInt(vpsId, 10);

    // 检查VPS是否存在
    const vps = db.select().from(schema.vps).where(eq(schema.vps.id, id)).get();
    if (!vps) {
      return reply.status(404).send({ error: 'VPS not found' });
    }

    // 检查是否有正在进行的DD任务
    const activeTasks = db
      .select()
      .from(schema.ddTasks)
      .where(eq(schema.ddTasks.vpsId, id))
      .all()
      .filter((t) => !['completed', 'failed'].includes(t.status));

    if (activeTasks.length > 0) {
      const shouldForce = force === '1' || force === 'true';
      if (!shouldForce) {
        return reply.status(400).send({ error: '该VPS已有正在进行的DD任务' });
      }
      ddService.cancelActiveTasksByVps(id);
    }

    // 验证版本是否支持
    const supportedVersions = SUPPORTED_OS[body.targetOs as keyof typeof SUPPORTED_OS];
    if (!supportedVersions?.includes(body.targetVersion)) {
      return reply.status(400).send({ error: '不支持的系统版本' });
    }

    try {
      const taskId = await ddService.startDD({
        vpsId: id,
        targetOs: body.targetOs,
        targetVersion: body.targetVersion,
        newPassword: body.newPassword,
        newSshPort: body.newSshPort,
      });

      // 记录审计日志
      db.insert(schema.auditLogs).values({
        action: 'dd_start',
        targetType: 'vps',
        targetId: id,
        details: JSON.stringify({ targetOs: body.targetOs, targetVersion: body.targetVersion }),
        ip: request.ip,
        createdAt: new Date(),
      }).run();

      return { taskId, message: 'DD重装任务已开始' };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 获取DD任务状态
  fastify.get('/task/:taskId', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const task = ddService.getTaskStatus(parseInt(taskId, 10));

    if (!task) {
      return reply.status(404).send({ error: 'Task not found' });
    }

    return task;
  });

  // 获取VPS的DD任务历史
  fastify.get('/:vpsId/history', async (request) => {
    const { vpsId } = request.params as { vpsId: string };
    const tasks = ddService.getTasksByVPS(parseInt(vpsId, 10));
    return { items: tasks };
  });
};
