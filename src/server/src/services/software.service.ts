import { db, schema } from '../db/index.js';
import { eq, sql, desc } from 'drizzle-orm';
import { agentManager } from '../websocket/agent.js';
import * as auditService from './audit.service.js';

export interface CreateSoftwareData {
  name: string;
  displayName: string;
  description?: string | null;
  category?: string | null;
  installMethod: 'script' | 'command' | 'apt' | 'yum';
  installScript: string;
  uninstallScript?: string | null;
  checkCommand?: string | null;
  versionCommand?: string | null;
  serviceName?: string | null;
  configPath?: string | null;
  configContent?: string | null;
  serviceConfigContent?: string | null;
}

export interface InstallResult {
  vpsId: number;
  success: boolean;
  error?: string;
  version?: string;
}

export function buildServiceStatusCommand(serviceName: string): string {
  return `
if command -v systemctl >/dev/null 2>&1; then
  systemctl is-active ${serviceName}
elif command -v rc-service >/dev/null 2>&1; then
  rc-service ${serviceName} status
elif command -v service >/dev/null 2>&1; then
  service ${serviceName} status
else
  echo "unknown"
  exit 1
fi
`;
}

export function buildServiceActionCommand(serviceName: string, action: 'start' | 'stop' | 'restart'): string {
  return `
if command -v systemctl >/dev/null 2>&1; then
  systemctl ${action} ${serviceName}
elif command -v rc-service >/dev/null 2>&1; then
  rc-service ${serviceName} ${action}
elif command -v service >/dev/null 2>&1; then
  service ${serviceName} ${action}
else
  echo "unsupported"
  exit 1
fi
`;
}

export function normalizeServiceStatus(output: string): string {
  const value = output.toLowerCase().trim();
  if (!value) {
    return 'unknown';
  }
  if (value.includes('failed')) {
    return 'failed';
  }
  if (value.includes('inactive') || value.includes('stopped') || value.includes('dead') || value.includes('not running')) {
    return 'inactive';
  }
  if (value === 'active' || value.includes('started') || value.includes('running')) {
    return 'active';
  }
  return 'unknown';
}

export function parseVersion(output: string): string | null {
  const patterns = [
    /v?(\d+\.\d+\.\d+)/,
    /version[:\s]+(\d+\.\d+\.\d+)/i,
    /(\d+\.\d+)/,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return output.trim().substring(0, 50);
}

export function getSoftwareList(): { items: any[] } {
  const softwareList = db
    .select()
    .from(schema.software)
    .where(eq(schema.software.enabled, true))
    .orderBy(desc(schema.software.createdAt))
    .all();

  const allVps = db
    .select({
      id: schema.vps.id,
      name: schema.vps.name,
      agentStatus: schema.vps.agentStatus,
    })
    .from(schema.vps)
    .all();

  const installations = db
    .select()
    .from(schema.softwareInstallations)
    .all();

  const items = softwareList.map(software => {
    const softwareInstallations = installations
      .filter(inst => inst.softwareId === software.id)
      .reduce((acc, inst) => {
        acc[inst.vpsId] = inst;
        return acc;
      }, {} as Record<number, any>);

    return {
      ...software,
      installations: allVps.map(vps => ({
        vpsId: vps.id,
        vpsName: vps.name,
        status: softwareInstallations[vps.id]?.status || 'uninstalled',
        version: softwareInstallations[vps.id]?.version || null,
        installedAt: softwareInstallations[vps.id]?.installedAt || null,
      })),
    };
  });

  return { items };
}

export function getSoftwareById(id: number): any | null {
  return db
    .select()
    .from(schema.software)
    .where(eq(schema.software.id, id))
    .get() || null;
}

export function createSoftware(data: CreateSoftwareData, clientIp: string): { software: any; error?: string } {
  const existing = db
    .select()
    .from(schema.software)
    .where(eq(schema.software.name, data.name))
    .get();

  if (existing) {
    return { software: null, error: 'Software name already exists' };
  }

  const now = new Date();
  const result = db
    .insert(schema.software)
    .values({
      ...data,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const software = db
    .select()
    .from(schema.software)
    .where(eq(schema.software.id, Number(result.lastInsertRowid)))
    .get();

  auditService.logAudit({
    action: 'software_create',
    targetType: 'software',
    targetId: Number(result.lastInsertRowid),
    details: { name: data.name },
    ip: clientIp,
  });

  return { software };
}

export function updateSoftware(id: number, data: Partial<CreateSoftwareData>, clientIp: string): { success: boolean; error?: string } {
  const software = db
    .select()
    .from(schema.software)
    .where(eq(schema.software.id, id))
    .get();

  if (!software) {
    return { success: false, error: 'Software not found' };
  }

  if (data.name && data.name !== software.name) {
    const existing = db
      .select()
      .from(schema.software)
      .where(eq(schema.software.name, data.name))
      .get();

    if (existing) {
      return { success: false, error: 'Software name already exists' };
    }
  }

  db.update(schema.software)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(schema.software.id, id))
    .run();

  auditService.logAudit({
    action: 'software_update',
    targetType: 'software',
    targetId: id,
    details: data,
    ip: clientIp,
  });

  return { success: true };
}

export function deleteSoftware(id: number, clientIp: string): { success: boolean; error?: string } {
  const software = db
    .select()
    .from(schema.software)
    .where(eq(schema.software.id, id))
    .get();

  if (!software) {
    return { success: false, error: 'Software not found' };
  }

  db.delete(schema.software)
    .where(eq(schema.software.id, id))
    .run();

  auditService.logAudit({
    action: 'software_delete',
    targetType: 'software',
    targetId: id,
    details: { name: software.name },
    ip: clientIp,
  });

  return { success: true };
}

export async function installBaseSoftware(vpsIds: number[]): Promise<{ results: InstallResult[] }> {
  const results: InstallResult[] = [];
  const command = `
set -e
if command -v apt-get >/dev/null 2>&1; then
  apt-get update
  apt-get install -y nftables openssh-server bash-completion vnstat ca-certificates curl wget zip unzip tar
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y nftables openssh-server bash-completion vnstat ca-certificates curl wget zip unzip tar
elif command -v yum >/dev/null 2>&1; then
  yum install -y nftables openssh-server bash-completion vnstat ca-certificates curl wget zip unzip tar
elif command -v apk >/dev/null 2>&1; then
  apk add --no-cache nftables openssh bash-completion vnstat ca-certificates curl wget zip unzip tar
else
  echo "Unsupported package manager"
  exit 1
fi
`;

  for (const vpsId of vpsIds) {
    const agent = agentManager.getAgent(vpsId);
    if (!agent) {
      results.push({ vpsId, success: false, error: 'Agent not connected' });
      continue;
    }

    try {
      const result = await agent.exec(command, 120000);
      if (result.exitCode !== 0) {
        throw new Error(result.stderr || result.stdout || 'Install base software failed');
      }
      results.push({ vpsId, success: true });
    } catch (err: any) {
      results.push({ vpsId, success: false, error: err.message || 'Install failed' });
    }
  }

  return { results };
}

export async function installSoftware(softwareId: number, vpsIds: number[], clientIp: string): Promise<{ results: InstallResult[]; affectedServers: number } | { error: string }> {
  const software = db
    .select()
    .from(schema.software)
    .where(eq(schema.software.id, softwareId))
    .get();

  if (!software) {
    return { error: 'Software not found' };
  }

  let targetVpsIds = vpsIds;
  if (vpsIds.length === 0) {
    const allVps = db
      .select({ id: schema.vps.id })
      .from(schema.vps)
      .where(eq(schema.vps.agentStatus, 'online'))
      .all();
    targetVpsIds = allVps.map(v => v.id);
  }

  const results: InstallResult[] = [];

  for (const vpsId of targetVpsIds) {
    const now = new Date();

    const existingInstallation = db
      .select()
      .from(schema.softwareInstallations)
      .where(
        sql`${schema.softwareInstallations.softwareId} = ${softwareId} AND ${schema.softwareInstallations.vpsId} = ${vpsId}`
      )
      .get();

    const installationRecord = {
      softwareId,
      vpsId,
      status: 'installing' as const,
      createdAt: now,
      updatedAt: now,
    };

    if (existingInstallation) {
      db.update(schema.softwareInstallations)
        .set(installationRecord)
        .where(eq(schema.softwareInstallations.id, existingInstallation.id))
        .run();
    } else {
      db.insert(schema.softwareInstallations).values(installationRecord).run();
    }

    const agent = agentManager.getAgent(vpsId);
    if (!agent) {
      const errorMsg = 'Agent not connected';
      db.update(schema.softwareInstallations)
        .set({
          status: 'failed',
          errorMessage: errorMsg,
          updatedAt: new Date(),
        })
        .where(
          sql`${schema.softwareInstallations.softwareId} = ${softwareId} AND ${schema.softwareInstallations.vpsId} = ${vpsId}`
        )
        .run();
      results.push({ vpsId, success: false, error: errorMsg });
      continue;
    }

    try {
      const installResult = await agent.exec(software.installScript);

      if (installResult.exitCode !== 0) {
        throw new Error(installResult.stderr || installResult.stdout || 'Installation failed');
      }

      if (software.configPath && software.configContent) {
        await agent.exec(`mkdir -p "$(dirname "${software.configPath}")"`);
        await agent.writeFile(software.configPath, software.configContent);
      }
      if (software.serviceName && software.serviceConfigContent) {
        const servicePath = `/etc/systemd/system/${software.serviceName}.service`;
        await agent.writeFile(servicePath, software.serviceConfigContent);
        const reloadResult = await agent.exec('systemctl daemon-reload');
        if (reloadResult.exitCode !== 0) {
          throw new Error(reloadResult.stderr || reloadResult.stdout || 'Service daemon-reload failed');
        }
      }
      if (software.serviceName) {
        const startResult = await agent.exec(buildServiceActionCommand(software.serviceName, 'start'));
        if (startResult.exitCode !== 0) {
          throw new Error(startResult.stderr || startResult.stdout || 'Service start failed');
        }
      }

      let version: string | null = null;
      if (software.versionCommand) {
        const versionResult = await agent.exec(software.versionCommand);
        if (versionResult.exitCode === 0) {
          version = parseVersion(versionResult.stdout);
        }
      }

      db.update(schema.softwareInstallations)
        .set({
          status: 'installed',
          version,
          installOutput: installResult.stdout,
          installedAt: new Date(),
          updatedAt: new Date(),
          errorMessage: null,
        })
        .where(
          sql`${schema.softwareInstallations.softwareId} = ${softwareId} AND ${schema.softwareInstallations.vpsId} = ${vpsId}`
        )
        .run();

      results.push({ vpsId, success: true, version: version || undefined });
    } catch (err: any) {
      const errorMsg = err.message || 'Unknown error';
      db.update(schema.softwareInstallations)
        .set({
          status: 'failed',
          errorMessage: errorMsg,
          updatedAt: new Date(),
        })
        .where(
          sql`${schema.softwareInstallations.softwareId} = ${softwareId} AND ${schema.softwareInstallations.vpsId} = ${vpsId}`
        )
        .run();
      results.push({ vpsId, success: false, error: errorMsg });
    }
  }

  auditService.logAudit({
    action: 'software_install',
    targetType: 'software',
    targetId: softwareId,
    details: { vpsIds: targetVpsIds, results },
    ip: clientIp,
  });

  return { results, affectedServers: targetVpsIds.length };
}

export async function uninstallSoftware(softwareId: number, vpsIds: number[], clientIp: string): Promise<{ results: InstallResult[]; affectedServers: number } | { error: string }> {
  const software = db
    .select()
    .from(schema.software)
    .where(eq(schema.software.id, softwareId))
    .get();

  if (!software) {
    return { error: 'Software not found' };
  }

  if (!software.uninstallScript) {
    return { error: 'Uninstall script not defined' };
  }

  const results: InstallResult[] = [];

  for (const vpsId of vpsIds) {
    const agent = agentManager.getAgent(vpsId);
    if (!agent) {
      results.push({ vpsId, success: false, error: 'Agent not connected' });
      continue;
    }

    try {
      const uninstallResult = await agent.exec(software.uninstallScript);

      if (uninstallResult.exitCode !== 0) {
        throw new Error(uninstallResult.stderr || uninstallResult.stdout || 'Uninstall failed');
      }

      db.update(schema.softwareInstallations)
        .set({
          status: 'uninstalled',
          updatedAt: new Date(),
        })
        .where(
          sql`${schema.softwareInstallations.softwareId} = ${softwareId} AND ${schema.softwareInstallations.vpsId} = ${vpsId}`
        )
        .run();

      results.push({ vpsId, success: true });
    } catch (err: any) {
      results.push({ vpsId, success: false, error: err.message });
    }
  }

  auditService.logAudit({
    action: 'software_uninstall',
    targetType: 'software',
    targetId: softwareId,
    details: { vpsIds, results },
    ip: clientIp,
  });

  return { results, affectedServers: vpsIds.length };
}

export function getInstallationStatus(softwareId: number, vpsId: number): any {
  const installation = db
    .select()
    .from(schema.softwareInstallations)
    .where(
      sql`${schema.softwareInstallations.softwareId} = ${softwareId} AND ${schema.softwareInstallations.vpsId} = ${vpsId}`
    )
    .get();

  if (!installation) {
    return { status: 'uninstalled' };
  }

  return {
    status: installation.status,
    version: installation.version,
    installedAt: installation.installedAt,
    errorMessage: installation.errorMessage,
  };
}

export async function getServiceStatus(softwareId: number, vpsId: number): Promise<{ status: string } | { error: string }> {
  const software = db
    .select()
    .from(schema.software)
    .where(eq(schema.software.id, softwareId))
    .get();

  if (!software) {
    return { error: 'Software not found' };
  }

  if (!software.serviceName) {
    return { error: 'Service name not configured' };
  }

  const agent = agentManager.getAgent(vpsId);
  if (!agent) {
    return { error: 'Agent not connected' };
  }

  try {
    const result = await agent.exec(buildServiceStatusCommand(software.serviceName));
    const rawStatus = (result.stdout || '').trim() || (result.stderr || '').trim();
    const status = normalizeServiceStatus(rawStatus);
    return { status };
  } catch (err: any) {
    return { error: err.message || 'Failed to fetch status' };
  }
}

export async function controlService(softwareId: number, vpsId: number, action: 'start' | 'stop' | 'restart'): Promise<{ success: boolean; error?: string }> {
  const software = db
    .select()
    .from(schema.software)
    .where(eq(schema.software.id, softwareId))
    .get();

  if (!software) {
    return { success: false, error: 'Software not found' };
  }

  if (!software.serviceName) {
    return { success: false, error: 'Service name not configured' };
  }

  const agent = agentManager.getAgent(vpsId);
  if (!agent) {
    return { success: false, error: 'Agent not connected' };
  }

  try {
    const result = await agent.exec(buildServiceActionCommand(software.serviceName, action));
    if (result.exitCode !== 0) {
      return { success: false, error: result.stderr || result.stdout || 'Service action failed' };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Service action failed' };
  }
}

export async function getConfig(softwareId: number, vpsId: number): Promise<{ path: string; content: string } | { error: string }> {
  const software = db
    .select()
    .from(schema.software)
    .where(eq(schema.software.id, softwareId))
    .get();

  if (!software) {
    return { error: 'Software not found' };
  }

  if (!software.configPath) {
    return { error: 'Config path not configured' };
  }

  const agent = agentManager.getAgent(vpsId);
  if (!agent) {
    return { error: 'Agent not connected' };
  }

  try {
    const content = await agent.readFile(software.configPath);
    return { path: software.configPath, content };
  } catch (err: any) {
    return { error: err.message || 'Failed to read config' };
  }
}

export async function updateConfig(softwareId: number, vpsId: number, content: string): Promise<{ success: boolean; error?: string }> {
  const software = db
    .select()
    .from(schema.software)
    .where(eq(schema.software.id, softwareId))
    .get();

  if (!software) {
    return { success: false, error: 'Software not found' };
  }

  if (!software.configPath) {
    return { success: false, error: 'Config path not configured' };
  }

  const agent = agentManager.getAgent(vpsId);
  if (!agent) {
    return { success: false, error: 'Agent not connected' };
  }

  try {
    await agent.writeFile(software.configPath, content);
    if (software.serviceName) {
      const result = await agent.exec(buildServiceActionCommand(software.serviceName, 'restart'));
      if (result.exitCode !== 0) {
        return { success: false, error: result.stderr || result.stdout || 'Service restart failed' };
      }
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update config' };
  }
}

export async function refreshAllInstallations(): Promise<{ success: boolean; refreshedCount: number }> {
  const allSoftware = db
    .select()
    .from(schema.software)
    .where(eq(schema.software.enabled, true))
    .all();

  const allVps = db
    .select({ id: schema.vps.id })
    .from(schema.vps)
    .where(eq(schema.vps.agentStatus, 'online'))
    .all();

  let refreshedCount = 0;

  for (const software of allSoftware) {
    if (!software.checkCommand || !software.versionCommand) {
      continue;
    }

    for (const vps of allVps) {
      const agent = agentManager.getAgent(vps.id);
      if (!agent) continue;

      try {
        const checkResult = await agent.exec(software.checkCommand);
        const isInstalled = checkResult.exitCode === 0;

        if (isInstalled) {
          const versionResult = await agent.exec(software.versionCommand);
          const version = versionResult.exitCode === 0
            ? parseVersion(versionResult.stdout)
            : null;

          const existing = db
            .select()
            .from(schema.softwareInstallations)
            .where(
              sql`${schema.softwareInstallations.softwareId} = ${software.id} AND ${schema.softwareInstallations.vpsId} = ${vps.id}`
            )
            .get();

          const now = new Date();

          if (existing) {
            db.update(schema.softwareInstallations)
              .set({
                status: 'installed',
                version,
                updatedAt: now,
              })
              .where(eq(schema.softwareInstallations.id, existing.id))
              .run();
          } else {
            db.insert(schema.softwareInstallations).values({
              softwareId: software.id,
              vpsId: vps.id,
              status: 'installed',
              version,
              installedAt: now,
              createdAt: now,
              updatedAt: now,
            }).run();
          }

          refreshedCount++;
        }
      } catch {
        // Ignore errors, continue to next
      }
    }
  }

  return { success: true, refreshedCount };
}

export function getInstallations(softwareId: number, options: { page: number; pageSize: number; vpsId?: number }): any {
  const { page, pageSize, vpsId } = options;
  const offset = (page - 1) * pageSize;

  let whereClause = sql`${schema.softwareInstallations.softwareId} = ${softwareId}`;
  if (vpsId) {
    whereClause = sql`${whereClause} AND ${schema.softwareInstallations.vpsId} = ${vpsId}`;
  }

  const items = db
    .select({
      id: schema.softwareInstallations.id,
      vpsId: schema.softwareInstallations.vpsId,
      vpsName: schema.vps.name,
      status: schema.softwareInstallations.status,
      version: schema.softwareInstallations.version,
      errorMessage: schema.softwareInstallations.errorMessage,
      installedAt: schema.softwareInstallations.installedAt,
      createdAt: schema.softwareInstallations.createdAt,
    })
    .from(schema.softwareInstallations)
    .leftJoin(schema.vps, eq(schema.softwareInstallations.vpsId, schema.vps.id))
    .where(whereClause)
    .orderBy(desc(schema.softwareInstallations.createdAt))
    .limit(pageSize)
    .offset(offset)
    .all();

  const totalResult = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.softwareInstallations)
    .where(whereClause)
    .get();

  return {
    items,
    total: totalResult?.count || 0,
    page,
    pageSize,
  };
}
