import { db, schema } from '../db/index.js';
import { eq, sql, desc } from 'drizzle-orm';
import { encrypt, decrypt, generateToken } from '../utils/crypto.js';
import {
  buildAgentDownloadBaseUrl,
  buildAgentInstallCommand,
  buildServerWsUrl,
  installAgentOverSshViaScp,
  resolvePublicBaseUrl,
} from './agent-install.js';
import { agentManager } from '../websocket/agent.js';
import * as auditService from './audit.service.js';
import * as agentService from './agent.service.js';
import * as geoService from './geo.service.js';

export interface CreateVpsData {
  name: string;
  ip: string;
  sshPort: number;
  authType: 'password' | 'key';
  authCredential: string;
  saveCredential: boolean;
  logo?: string;
  vendorUrl?: string;
  groupId?: number;
  groupIds?: number[];
  tagIds?: number[];
  billing?: BillingData;
}

export interface UpdateVpsData {
  name?: string;
  ip?: string;
  sshPort?: number;
  logo?: string;
  vendorUrl?: string;
  groupId?: number;
  groupIds?: number[];
  tagIds?: number[];
  billing?: BillingData;
}

export interface BillingData {
  currency: string;
  amount: number;
  bandwidth?: string;
  traffic?: string;
  trafficGb?: number;
  trafficCycle?: string;
  route?: string;
  billingCycle: string;
  cycleDays?: number;
  startDate: string;
  expireDate: string;
  autoRenew: boolean;
}

export interface VpsListQuery {
  page: number;
  pageSize: number;
  groupId?: number;
  status?: string;
  search?: string;
}

export interface PagedResult<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

export function getVpsList(query: VpsListQuery): PagedResult<any> {
  const { page, pageSize, groupId, status, search } = query;
  const offset = (page - 1) * pageSize;

  let whereClause = sql`1=1`;

  if (groupId) {
    whereClause = sql`${whereClause} AND (
      ${schema.vps.id} IN (SELECT vps_id FROM vps_group_members WHERE group_id = ${groupId})
      OR ${schema.vps.groupId} = ${groupId}
    )`;
  }

  if (status) {
    whereClause = sql`${whereClause} AND ${schema.vps.agentStatus} = ${status}`;
  }

  if (search) {
    whereClause = sql`${whereClause} AND (${schema.vps.name} LIKE ${'%' + search + '%'} OR ${schema.vps.ip} LIKE ${'%' + search + '%'})`;
  }

  const items = db
    .select()
    .from(schema.vps)
    .where(whereClause)
    .orderBy(desc(schema.vps.createdAt))
    .limit(pageSize)
    .offset(offset)
    .all();

  const totalResult = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.vps)
    .where(whereClause)
    .get();

  const itemsWithDetails = items.map((vpsItem) => {
    const tags = db
      .select({ id: schema.tags.id, name: schema.tags.name, color: schema.tags.color })
      .from(schema.vpsTags)
      .innerJoin(schema.tags, eq(schema.vpsTags.tagId, schema.tags.id))
      .where(eq(schema.vpsTags.vpsId, vpsItem.id))
      .all();

    const groups = db
      .select({ id: schema.vpsGroups.id, name: schema.vpsGroups.name })
      .from(schema.vpsGroupMembers)
      .innerJoin(schema.vpsGroups, eq(schema.vpsGroupMembers.groupId, schema.vpsGroups.id))
      .where(eq(schema.vpsGroupMembers.vpsId, vpsItem.id))
      .all();

    if (groups.length === 0 && vpsItem.groupId) {
      const legacyGroup = db
        .select({ id: schema.vpsGroups.id, name: schema.vpsGroups.name })
        .from(schema.vpsGroups)
        .where(eq(schema.vpsGroups.id, vpsItem.groupId))
        .get();
      if (legacyGroup) {
        groups.push(legacyGroup);
      }
    }

    const billing = db
      .select()
      .from(schema.vpsBilling)
      .where(eq(schema.vpsBilling.vpsId, vpsItem.id))
      .get();

    const { authCredential, ...safeVps } = vpsItem;
    return { ...safeVps, tags, groups, billing };
  });

  // 异步检查并刷新过期的地理信息
  geoService.checkAndRefreshGeoForList(
    items.map((v) => ({ id: v.id, geoUpdatedAt: v.geoUpdatedAt, agentStatus: v.agentStatus }))
  );

  return {
    total: totalResult?.count || 0,
    page,
    pageSize,
    items: itemsWithDetails,
  };
}

export function getVpsById(id: number): any | null {
  const vpsItem = db
    .select()
    .from(schema.vps)
    .where(eq(schema.vps.id, id))
    .get();

  if (!vpsItem) {
    return null;
  }

  const tags = db
    .select({ id: schema.tags.id, name: schema.tags.name, color: schema.tags.color })
    .from(schema.vpsTags)
    .innerJoin(schema.tags, eq(schema.vpsTags.tagId, schema.tags.id))
    .where(eq(schema.vpsTags.vpsId, vpsItem.id))
    .all();

  const billing = db
    .select()
    .from(schema.vpsBilling)
    .where(eq(schema.vpsBilling.vpsId, vpsItem.id))
    .get();

  const groups = db
    .select({ id: schema.vpsGroups.id, name: schema.vpsGroups.name })
    .from(schema.vpsGroupMembers)
    .innerJoin(schema.vpsGroups, eq(schema.vpsGroupMembers.groupId, schema.vpsGroups.id))
    .where(eq(schema.vpsGroupMembers.vpsId, vpsItem.id))
    .all();

  if (groups.length === 0 && vpsItem.groupId) {
    const legacyGroup = db
      .select({ id: schema.vpsGroups.id, name: schema.vpsGroups.name })
      .from(schema.vpsGroups)
      .where(eq(schema.vpsGroups.id, vpsItem.groupId))
      .get();
    if (legacyGroup) {
      groups.push(legacyGroup);
    }
  }

  const systemInfo = db
    .select()
    .from(schema.vpsSystemInfo)
    .where(eq(schema.vpsSystemInfo.vpsId, id))
    .get();

  const parsedSystemInfo = systemInfo
    ? {
        ...systemInfo,
        disks: systemInfo.disks ? JSON.parse(systemInfo.disks as unknown as string) : [],
        networks: systemInfo.networks ? JSON.parse(systemInfo.networks as unknown as string) : [],
      }
    : null;

  const { authCredential, ...safeVps } = vpsItem;

  // 异步检查并刷新过期的地理信息
  geoService.checkAndRefreshGeoIfNeeded(vpsItem.id, vpsItem.geoUpdatedAt, vpsItem.agentStatus);

  return { ...safeVps, tags, groups, billing, systemInfo: parsedSystemInfo };
}

export function createVps(data: CreateVpsData, clientIp: string, request: any): { id: number; agentToken: string; agentInstallCommand: string } {
  const now = new Date();
  const agentToken = generateToken(64);
  const encryptedCredential = data.saveCredential ? encrypt(data.authCredential) : '';

  const groupIds = data.groupIds?.length
    ? data.groupIds
    : data.groupId
      ? [data.groupId]
      : [];

  const result = db
    .insert(schema.vps)
    .values({
      name: data.name,
      ip: data.ip,
      sshPort: data.sshPort,
      authType: data.authType,
      authCredential: encryptedCredential,
      logo: data.logo || null,
      vendorUrl: data.vendorUrl || null,
      groupId: groupIds[0] || null,
      agentToken,
      agentStatus: 'installing',
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const vpsId = Number(result.lastInsertRowid);

  // Create billing record
  if (data.billing) {
    db.insert(schema.vpsBilling).values({
      vpsId,
      currency: data.billing.currency,
      amount: data.billing.amount,
      bandwidth: data.billing.bandwidth || null,
      traffic: data.billing.traffic || null,
      trafficGb: data.billing.trafficGb ?? null,
      trafficCycle: data.billing.trafficCycle || null,
      route: data.billing.route || null,
      billingCycle: data.billing.billingCycle,
      cycleDays: data.billing.cycleDays || null,
      startDate: new Date(data.billing.startDate),
      expireDate: new Date(data.billing.expireDate),
      autoRenew: data.billing.autoRenew,
    }).run();
  }

  // Associate tags
  if (data.tagIds && data.tagIds.length > 0) {
    for (const tagId of data.tagIds) {
      db.insert(schema.vpsTags).values({ vpsId, tagId }).run();
    }
  }

  // Associate groups
  if (groupIds.length > 0) {
    for (const groupId of groupIds) {
      db.insert(schema.vpsGroupMembers).values({ vpsId, groupId }).run();
    }
  }

  // Audit log
  auditService.logVpsCreate(vpsId, { name: data.name, ip: data.ip }, clientIp);

  // 注意：地理信息获取需要 Agent 在线后才能进行，由 getVpsList/getVpsById 按需触发

  // Build agent install URLs
  const publicBaseUrl = resolvePublicBaseUrl(request);
  const agentDownloadBaseUrl = buildAgentDownloadBaseUrl(publicBaseUrl);
  const serverAddr = buildServerWsUrl(publicBaseUrl);
  const agentInstallCommand = buildAgentInstallCommand(
    publicBaseUrl,
    agentDownloadBaseUrl,
    serverAddr,
    agentToken
  );

  // Install agent over SSH (async)
  installAgentOverSshViaScp({
    host: data.ip,
    port: data.sshPort,
    username: 'root',
    authType: data.authType,
    credential: data.authCredential,
    agentDownloadBaseUrl,
    agentToken,
    serverAddr,
  })
    .then((result) => {
      db.update(schema.vps)
        .set({
          agentStatus: 'pending',
          osType: result.detected.osType || null,
          osVersion: result.detected.osVersion || null,
          arch: result.detected.arch,
          updatedAt: new Date(),
        })
        .where(eq(schema.vps.id, vpsId))
        .run();
    })
    .catch((err) => {
      db.update(schema.vps)
        .set({ agentStatus: 'pending', updatedAt: new Date() })
        .where(eq(schema.vps.id, vpsId))
        .run();
      auditService.logAgentInstallFailed(vpsId, err?.message || String(err), err?.stack || null, clientIp);
    });

  return { id: vpsId, agentToken, agentInstallCommand };
}

export function updateVps(id: number, data: UpdateVpsData, clientIp: string): { success: boolean; error?: string } {
  const existing = db.select().from(schema.vps).where(eq(schema.vps.id, id)).get();
  if (!existing) {
    return { success: false, error: 'VPS not found' };
  }

  const updateData: any = { updatedAt: new Date() };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.ip !== undefined) updateData.ip = data.ip;
  if (data.sshPort !== undefined) updateData.sshPort = data.sshPort;
  if (data.logo !== undefined) updateData.logo = data.logo;
  if (data.vendorUrl !== undefined) updateData.vendorUrl = data.vendorUrl;
  if (data.groupId !== undefined) updateData.groupId = data.groupId;
  if (data.groupIds !== undefined) updateData.groupId = data.groupIds[0] || null;

  db.update(schema.vps).set(updateData).where(eq(schema.vps.id, id)).run();

  // Update billing
  if (data.billing) {
    db.delete(schema.vpsBilling).where(eq(schema.vpsBilling.vpsId, id)).run();
    db.insert(schema.vpsBilling).values({
      vpsId: id,
      currency: data.billing.currency,
      amount: data.billing.amount,
      bandwidth: data.billing.bandwidth || null,
      traffic: data.billing.traffic || null,
      trafficGb: data.billing.trafficGb ?? null,
      trafficCycle: data.billing.trafficCycle || null,
      route: data.billing.route || null,
      billingCycle: data.billing.billingCycle,
      cycleDays: data.billing.cycleDays || null,
      startDate: new Date(data.billing.startDate),
      expireDate: new Date(data.billing.expireDate),
      autoRenew: data.billing.autoRenew,
    }).run();
  }

  // Update tags
  if (data.tagIds !== undefined) {
    db.delete(schema.vpsTags).where(eq(schema.vpsTags.vpsId, id)).run();
    for (const tagId of data.tagIds) {
      db.insert(schema.vpsTags).values({ vpsId: id, tagId }).run();
    }
  }

  // Update groups
  if (data.groupIds !== undefined || data.groupId !== undefined) {
    const groupIds = data.groupIds?.length
      ? data.groupIds
      : data.groupId
        ? [data.groupId]
        : [];
    db.delete(schema.vpsGroupMembers).where(eq(schema.vpsGroupMembers.vpsId, id)).run();
    for (const groupId of groupIds) {
      db.insert(schema.vpsGroupMembers).values({ vpsId: id, groupId }).run();
    }
  }

  // Audit log (mask credential if present)
  const auditDetails = { ...data } as any;
  if (auditDetails.authCredential) {
    auditDetails.authCredential = '***';
  }
  auditService.logVpsUpdate(id, auditDetails, clientIp);

  return { success: true };
}

export function deleteVps(id: number, clientIp: string): { success: boolean; error?: string } {
  const existing = db.select().from(schema.vps).where(eq(schema.vps.id, id)).get();
  if (!existing) {
    return { success: false, error: 'VPS not found' };
  }

  db.delete(schema.vps).where(eq(schema.vps.id, id)).run();

  auditService.logVpsDelete(id, { name: existing.name, ip: existing.ip }, clientIp);

  return { success: true };
}

export function resetToken(id: number): { agentToken: string } {
  const newToken = generateToken(64);
  db.update(schema.vps)
    .set({ agentToken: newToken, agentStatus: 'pending', updatedAt: new Date() })
    .where(eq(schema.vps.id, id))
    .run();

  return { agentToken: newToken };
}

export function hasCredential(id: number): { hasCredential: boolean } | null {
  const vpsItem = db
    .select()
    .from(schema.vps)
    .where(eq(schema.vps.id, id))
    .get();

  if (!vpsItem) {
    return null;
  }

  return { hasCredential: !!(vpsItem.authCredential && vpsItem.authCredential.length > 0) };
}

export function getCredential(id: number): { authType: string; credential: string } | null {
  const vpsItem = db
    .select()
    .from(schema.vps)
    .where(eq(schema.vps.id, id))
    .get();

  if (!vpsItem) {
    return null;
  }

  return {
    authType: vpsItem.authType,
    credential: decrypt(vpsItem.authCredential),
  };
}

export interface InstallAgentOptions {
  authType?: 'password' | 'key';
  authCredential?: string;
}

export async function installAgent(
  id: number,
  options: InstallAgentOptions,
  clientIp: string,
  request: any
): Promise<{ status: string; method: string; error?: string; requireCredential?: boolean }> {
  const vps = db.select().from(schema.vps).where(eq(schema.vps.id, id)).get();
  if (!vps) {
    return { status: 'error', method: '', error: 'VPS not found' };
  }

  const publicBaseUrl = resolvePublicBaseUrl(request);
  const agentDownloadBaseUrl = buildAgentDownloadBaseUrl(publicBaseUrl);
  const serverAddr = buildServerWsUrl(publicBaseUrl);

  // Check if agent is online
  const agent = agentManager.getAgent(id);
  if (agent) {
    // Agent online, update via WebSocket
    try {
      const archResult = await agent.exec('uname -m', 5000);
      let arch = archResult.stdout.trim();
      if (arch === 'x86_64') arch = 'amd64';
      else if (arch === 'aarch64' || arch === 'arm64') arch = 'arm64';
      else {
        return { status: 'error', method: 'websocket', error: `不支持的架构: ${arch}` };
      }

      db.update(schema.vps)
        .set({ agentStatus: 'installing', updatedAt: new Date() })
        .where(eq(schema.vps.id, id))
        .run();

      const binaryUrl = `${agentDownloadBaseUrl}/mynode-agent-linux-${arch}`;
      const updateScript = `#!/bin/bash
curl -fsSL "${binaryUrl}" -o /tmp/mynode-agent-new
chmod +x /tmp/mynode-agent-new
cp /tmp/mynode-agent-new /usr/local/bin/mynode-agent
rm -f /tmp/mynode-agent-new
systemctl restart mynode-agent
`;

      const updateCommand = `echo '${updateScript.replace(/'/g, "'\\''")}' > /tmp/mynode-update.sh && chmod +x /tmp/mynode-update.sh && setsid /tmp/mynode-update.sh > /tmp/mynode-update.log 2>&1 &`;

      agent.exec(updateCommand, 10000)
        .then(() => {
          db.update(schema.vps)
            .set({ agentStatus: 'pending', updatedAt: new Date() })
            .where(eq(schema.vps.id, id))
            .run();
        })
        .catch((err) => {
          db.update(schema.vps)
            .set({ agentStatus: 'online', updatedAt: new Date() })
            .where(eq(schema.vps.id, id))
            .run();
          auditService.logAgentUpdateFailed(id, err?.message || String(err), clientIp);
        });

      return { status: 'updating', method: 'websocket' };
    } catch (err: any) {
      return { status: 'error', method: 'websocket', error: err.message || '更新失败' };
    }
  }

  // Agent offline, need SSH credentials
  let authType = options.authType || vps.authType;
  let credential = options.authCredential;

  if (!credential && vps.authCredential) {
    try {
      credential = decrypt(vps.authCredential);
    } catch {
      // Decryption failed
    }
  }

  if (!credential) {
    return {
      status: 'error',
      method: 'ssh',
      error: 'SSH credential required',
      requireCredential: true,
    };
  }

  db.update(schema.vps)
    .set({ agentStatus: 'installing', updatedAt: new Date() })
    .where(eq(schema.vps.id, id))
    .run();

  installAgentOverSshViaScp({
    host: vps.ip,
    port: vps.sshPort,
    username: 'root',
    authType,
    credential,
    agentDownloadBaseUrl,
    agentToken: vps.agentToken,
    serverAddr,
  })
    .then((result) => {
      db.update(schema.vps)
        .set({
          agentStatus: 'pending',
          osType: result.detected.osType || null,
          osVersion: result.detected.osVersion || null,
          arch: result.detected.arch,
          updatedAt: new Date(),
        })
        .where(eq(schema.vps.id, id))
        .run();
    })
    .catch((err) => {
      db.update(schema.vps)
        .set({ agentStatus: 'pending', updatedAt: new Date() })
        .where(eq(schema.vps.id, id))
        .run();
      auditService.logAgentInstallFailed(id, err?.message || String(err), err?.stack || null, clientIp);
    });

  return { status: 'installing', method: 'ssh' };
}

export async function execCommand(
  id: number,
  command: string,
  timeout: number,
  clientIp: string
): Promise<{ exitCode: number; output: string; stdout: string; stderr: string } | { error: string }> {
  const vps = db.select().from(schema.vps).where(eq(schema.vps.id, id)).get();
  if (!vps) {
    return { error: 'VPS not found' };
  }

  try {
    const result = await agentService.execCommand(id, command, timeout);

    auditService.logVpsExec(id, { command, exitCode: result.exitCode }, clientIp);

    return {
      exitCode: result.exitCode,
      output: result.stdout + (result.stderr ? '\n' + result.stderr : ''),
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (err: any) {
    if (err instanceof agentService.AgentOfflineError) {
      return { error: 'Agent不在线' };
    }
    return { error: err.message || '执行失败' };
  }
}

export function getMetrics(id: number, options: { limit: number; since: Date | null }): { items: any[] } | null {
  const vpsItem = db
    .select()
    .from(schema.vps)
    .where(eq(schema.vps.id, id))
    .get();

  if (!vpsItem) {
    return null;
  }

  const sinceValue = options.since ? Math.floor(options.since.getTime() / 1000) : null;
  const nowMs = Date.now();
  const validSince = sinceValue && sinceValue <= nowMs ? sinceValue : null;

  // 构建查询条件：必须同时满足 vpsId 和时间范围
  const whereCondition = validSince
    ? sql`${schema.metrics.vpsId} = ${id} AND ${schema.metrics.collectedAt} >= ${validSince}`
    : eq(schema.metrics.vpsId, id);

  const metrics = db
    .select()
    .from(schema.metrics)
    .where(whereCondition)
    .orderBy(desc(schema.metrics.collectedAt))
    .limit(options.limit)
    .all()
    .reverse();

  return { items: metrics };
}

export function getPingMonitors(id: number): { items: any[] } | null {
  const vpsItem = db
    .select()
    .from(schema.vps)
    .where(eq(schema.vps.id, id))
    .get();

  if (!vpsItem) {
    return null;
  }

  const monitors = db
    .select()
    .from(schema.pingMonitors)
    .where(eq(schema.pingMonitors.vpsId, id))
    .all();

  return { items: monitors };
}

export function getPingResults(
  vpsId: number,
  monitorId: number,
  options: { limit: number; since: Date | null }
): { items: any[] } | null {
  const monitor = db
    .select()
    .from(schema.pingMonitors)
    .where(eq(schema.pingMonitors.id, monitorId))
    .get();

  if (!monitor || monitor.vpsId !== vpsId) {
    return null;
  }

  const sinceValue = options.since ? Math.floor(options.since.getTime() / 1000) : null;
  const nowMs = Date.now();
  const validSince = sinceValue && sinceValue <= nowMs ? sinceValue : null;

  const resultsQuery = db
    .select()
    .from(schema.pingResults)
    .where(eq(schema.pingResults.monitorId, monitorId));

  const results = (validSince
    ? resultsQuery.where(sql`${schema.pingResults.collectedAt} >= ${validSince}`)
    : resultsQuery)
    .orderBy(desc(schema.pingResults.collectedAt))
    .limit(options.limit)
    .all()
    .reverse();

  return { items: results };
}
