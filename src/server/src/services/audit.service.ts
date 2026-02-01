import { db, schema } from '../db/index.js';

export interface AuditLogParams {
  action: string;
  targetType?: string | null;
  targetId?: number | null;
  details?: unknown;
  ip: string;
}

export function logAudit(params: AuditLogParams): void {
  db.insert(schema.auditLogs).values({
    action: params.action,
    targetType: params.targetType || null,
    targetId: params.targetId || null,
    details: params.details ? JSON.stringify(params.details) : null,
    ip: params.ip,
    createdAt: new Date(),
  }).run();
}

export function logLogin(ip: string): void {
  logAudit({ action: 'login', ip });
}

export function logLogout(ip: string): void {
  logAudit({ action: 'logout', ip });
}

export function logVpsCreate(vpsId: number, details: { name: string; ip: string }, ip: string): void {
  logAudit({
    action: 'vps_create',
    targetType: 'vps',
    targetId: vpsId,
    details,
    ip,
  });
}

export function logVpsUpdate(vpsId: number, details: unknown, ip: string): void {
  logAudit({
    action: 'vps_update',
    targetType: 'vps',
    targetId: vpsId,
    details,
    ip,
  });
}

export function logVpsDelete(vpsId: number, details: { name: string; ip: string }, ip: string): void {
  logAudit({
    action: 'vps_delete',
    targetType: 'vps',
    targetId: vpsId,
    details,
    ip,
  });
}

export function logVpsExec(vpsId: number, details: { command: string; exitCode: number }, ip: string): void {
  logAudit({
    action: 'vps_exec',
    targetType: 'vps',
    targetId: vpsId,
    details,
    ip,
  });
}

export function logAgentInstallFailed(vpsId: number, error: string, stack: string | null, ip: string): void {
  logAudit({
    action: 'agent_install_failed',
    targetType: 'vps',
    targetId: vpsId,
    details: { error, stack },
    ip,
  });
}

export function logAgentUpdateFailed(vpsId: number, error: string, ip: string): void {
  logAudit({
    action: 'agent_update_failed',
    targetType: 'vps',
    targetId: vpsId,
    details: { error },
    ip,
  });
}
