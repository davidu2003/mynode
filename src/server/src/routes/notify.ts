import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { eq, desc } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import { encrypt, decrypt } from '../utils/crypto.js';

async function authenticate(request: any, reply: any) {
  try {
    await request.jwtVerify();
  } catch {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}

const emailConfigSchema = z.object({
  enabled: z.boolean(),
  smtpHost: z.string(),
  smtpPort: z.number(),
  smtpUser: z.string(),
  smtpPass: z.string(),
  fromAddress: z.string().email(),
  useTls: z.boolean().default(true),
});

const telegramConfigSchema = z.object({
  enabled: z.boolean(),
  botToken: z.string(),
  chatId: z.string(),
});

export const notifyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // 获取通知配置
  fastify.get('/config', async () => {
    const emailConfig = db
      .select()
      .from(schema.notifyConfig)
      .where(eq(schema.notifyConfig.type, 'email'))
      .get();

    const telegramConfig = db
      .select()
      .from(schema.notifyConfig)
      .where(eq(schema.notifyConfig.type, 'telegram'))
      .get();

    // 解密敏感字段
    let email = null;
    if (emailConfig) {
      const config = emailConfig.config as any;
      email = {
        enabled: emailConfig.enabled,
        smtpHost: config.smtpHost,
        smtpPort: config.smtpPort,
        smtpUser: config.smtpUser,
        smtpPass: '********', // 不返回密码
        fromAddress: config.fromAddress,
        useTls: config.useTls,
      };
    }

    let telegram = null;
    if (telegramConfig) {
      const config = telegramConfig.config as any;
      telegram = {
        enabled: telegramConfig.enabled,
        botToken: '********', // 不返回Token
        chatId: config.chatId,
      };
    }

    return { email, telegram };
  });

  // 更新邮件配置
  fastify.put('/config/email', async (request) => {
    const body = emailConfigSchema.parse(request.body);

    const configData = {
      smtpHost: body.smtpHost,
      smtpPort: body.smtpPort,
      smtpUser: body.smtpUser,
      smtpPass: encrypt(body.smtpPass),
      fromAddress: body.fromAddress,
      useTls: body.useTls,
    };

    const existing = db
      .select()
      .from(schema.notifyConfig)
      .where(eq(schema.notifyConfig.type, 'email'))
      .get();

    if (existing) {
      db.update(schema.notifyConfig)
        .set({ enabled: body.enabled, config: JSON.stringify(configData) })
        .where(eq(schema.notifyConfig.id, existing.id))
        .run();
    } else {
      db.insert(schema.notifyConfig).values({
        type: 'email',
        enabled: body.enabled,
        config: JSON.stringify(configData),
      }).run();
    }

    return { success: true };
  });

  // 更新Telegram配置
  fastify.put('/config/telegram', async (request) => {
    const body = telegramConfigSchema.parse(request.body);

    const configData = {
      botToken: encrypt(body.botToken),
      chatId: body.chatId,
    };

    const existing = db
      .select()
      .from(schema.notifyConfig)
      .where(eq(schema.notifyConfig.type, 'telegram'))
      .get();

    if (existing) {
      db.update(schema.notifyConfig)
        .set({ enabled: body.enabled, config: JSON.stringify(configData) })
        .where(eq(schema.notifyConfig.id, existing.id))
        .run();
    } else {
      db.insert(schema.notifyConfig).values({
        type: 'telegram',
        enabled: body.enabled,
        config: JSON.stringify(configData),
      }).run();
    }

    return { success: true };
  });

  // 测试通知
  fastify.post('/test/:channel', async (request, reply) => {
    const { channel } = request.params as { channel: string };
    const { recipient } = request.body as { recipient?: string };

    if (channel === 'email') {
      const configRow = db
        .select()
        .from(schema.notifyConfig)
        .where(eq(schema.notifyConfig.type, 'email'))
        .get();

      if (!configRow) {
        return reply.status(400).send({ error: 'Email not configured' });
      }

      const config = configRow.config as any;
      const transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.useTls,
        auth: {
          user: config.smtpUser,
          pass: decrypt(config.smtpPass),
        },
      });

      try {
        await transporter.sendMail({
          from: config.fromAddress,
          to: recipient || config.fromAddress,
          subject: 'Mynode Test Notification',
          text: 'This is a test notification from Mynode VPS Management System.',
        });
        return { success: true };
      } catch (err: any) {
        return reply.status(500).send({ error: err.message });
      }
    }

    if (channel === 'telegram') {
      const configRow = db
        .select()
        .from(schema.notifyConfig)
        .where(eq(schema.notifyConfig.type, 'telegram'))
        .get();

      if (!configRow) {
        return reply.status(400).send({ error: 'Telegram not configured' });
      }

      const config = configRow.config as any;
      const botToken = decrypt(config.botToken);

      try {
        const response = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: config.chatId,
              text: '🔔 Mynode Test Notification\n\nThis is a test message from your VPS management system.',
            }),
          }
        );

        if (!response.ok) {
          const error = await response.json();
          return reply.status(500).send({ error: (error as any).description });
        }

        return { success: true };
      } catch (err: any) {
        return reply.status(500).send({ error: err.message });
      }
    }

    return reply.status(400).send({ error: 'Invalid channel' });
  });

  // 获取通知历史
  fastify.get('/history', async (request) => {
    const query = request.query as { page?: string; pageSize?: string };
    const page = parseInt(query.page || '1', 10);
    const pageSize = parseInt(query.pageSize || '50', 10);

    const items = db
      .select()
      .from(schema.notifications)
      .orderBy(desc(schema.notifications.sentAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all();

    return { items };
  });
};
