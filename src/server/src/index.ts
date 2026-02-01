import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { config } from './config/index.js';
import { migrate } from './db/migrate.js';
import { authRoutes } from './routes/auth.js';
import { vpsRoutes } from './routes/vps.js';
import { agentRoutes } from './routes/agent.js';
import { configModuleRoutes } from './routes/config-modules.js';
import { softwareRoutes } from './routes/software.js';
import { notifyRoutes } from './routes/notify.js';
import { systemRoutes } from './routes/system.js';
import { ddRoutes } from './routes/dd.js';
import { agentDownloadRoutes } from './routes/agent-download.js';
import { agentWebSocket } from './websocket/agent.js';
import { startBillingAutoRenew } from './services/billing-renew.js';

const fastify = Fastify({
  logger: {
    level: config.isDev ? 'info' : 'warn',
  },
});

async function bootstrap() {
  // 初始化数据库
  await migrate();

  // 注册插件
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  await fastify.register(cookie);

  await fastify.register(jwt, {
    secret: config.jwtSecret,
    cookie: {
      cookieName: 'token',
      signed: false,
    },
  });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    skipOnError: true,
    // 豁免某些路由
    skip: (request) => {
      // 豁免认证相关的路由，避免登录检查触发限流
      const path = request.url;
      return path.includes('/api/auth/status') ||
             path.includes('/api/auth/me') ||
             path.includes('/health');
    },
  });

  await fastify.register(websocket);

  // 基础路径前缀
  const prefix = config.basePath;

  // 健康检查
  fastify.get(`${prefix}/health`, async () => ({ status: 'ok', timestamp: Date.now() }));

  // 注册路由
  await fastify.register(authRoutes, { prefix: `${prefix}/api/auth` });
  await fastify.register(vpsRoutes, { prefix: `${prefix}/api/vps` });
  await fastify.register(agentRoutes, { prefix: `${prefix}/api/agent` });
  await fastify.register(configModuleRoutes, { prefix: `${prefix}/api/config` });
  await fastify.register(softwareRoutes, { prefix: `${prefix}/api/software` });
  await fastify.register(notifyRoutes, { prefix: `${prefix}/api/notify` });
  await fastify.register(systemRoutes, { prefix: `${prefix}/api/system` });
  await fastify.register(ddRoutes, { prefix: `${prefix}/api/dd` });
  await fastify.register(agentDownloadRoutes, { prefix: `${prefix}/agent` });

  // Agent WebSocket
  await fastify.register(agentWebSocket, { prefix: `${prefix}/ws` });

  // 启动自动续费检查
  startBillingAutoRenew(config.billingAutoRenewIntervalMs);

  // 启动服务器
  try {
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`Server running at http://${config.host}:${config.port}${prefix}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

bootstrap();
