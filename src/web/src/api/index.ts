import axios from 'axios';

const BASE_PATH = import.meta.env.VITE_BASE_PATH || '';

export const api = axios.create({
  baseURL: `${BASE_PATH}/api`,
  withCredentials: true,
});

// 响应拦截器处理401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 对于认证检查接口，不进行重定向，避免无限循环
    const url = error.config?.url || '';
    const isAuthCheck = url.includes('/auth/status') || url.includes('/auth/me');

    if (error.response?.status === 401 && !isAuthCheck) {
      window.location.href = `${BASE_PATH}/login`;
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  status: () => api.get('/auth/status'),
  setup: (data: { username: string; password: string }) => api.post('/auth/setup', data),
  login: (data: { username: string; password: string }) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    api.post('/auth/change-password', data),
};

// VPS API
type VpsCreatePayload = {
  name: string;
  ip: string;
  sshPort?: number;
  authType?: 'password' | 'key';
  authCredential?: string;
  saveCredential?: boolean;
  logo?: string;
  vendorUrl?: string;
  groupId?: number;
  groupIds?: number[];
  tagIds?: number[];
  billing?: {
    currency: string;
    amount: number;
    bandwidth?: string;
    traffic?: string;
    trafficGb?: number;
    trafficCycle?: string;
    route?: string;
    billingCycle: string;
    cycleDays?: number;
    startDate?: string;
    expireDate?: string;
    autoRenew?: boolean;
  };
};

type VpsUpdatePayload = Omit<VpsCreatePayload, 'authType' | 'authCredential' | 'saveCredential'>;

type NotifyEmailConfig = {
  enabled?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  fromAddress?: string;
  useTls?: boolean;
};

type NotifyTelegramConfig = {
  enabled?: boolean;
  botToken?: string;
  chatId?: string;
};

type NetworkMonitorItem = {
  id?: string | number;
  name: string;
  type: 'icmp' | 'tcp';
  target: string;
  interval: number;
  timeout?: number;
  enabled?: boolean;
};

type ConfigModuleContent = Record<string, unknown>;

type SoftwarePayload = {
  name: string;
  displayName: string;
  description?: string;
  category?: string;
  installMethod: string;
  installScript: string;
  uninstallScript?: string;
  checkCommand?: string;
  versionCommand?: string;
  serviceName?: string;
  configPath?: string;
  configContent?: string;
  serviceConfigContent?: string;
};

export const vpsApi = {
  list: (params?: {
    page?: number;
    pageSize?: number;
    groupId?: number;
    status?: string;
    search?: string;
  }) => api.get('/vps', { params }),
  get: (id: number) => api.get(`/vps/${id}`),
  create: (data: VpsCreatePayload) => api.post('/vps', data),
  update: (id: number, data: VpsUpdatePayload) => api.put(`/vps/${id}`, data),
  delete: (id: number) => api.delete(`/vps/${id}`),
  resetToken: (id: number) => api.post(`/vps/${id}/reset-token`),
  hasCredential: (id: number) => api.get(`/vps/${id}/has-credential`),
  installAgent: (id: number, data?: { authType?: string; authCredential?: string }) =>
    api.post(`/vps/${id}/install-agent`, data || {}),
  exec: (id: number, command: string, timeout?: number) =>
    api.post(`/vps/${id}/exec`, { command, timeout }),
  metrics: (id: number, params?: { limit?: number; since?: string }) =>
    api.get(`/vps/${id}/metrics`, { params }),
  pingMonitors: (id: number) => api.get(`/vps/${id}/ping-monitors`),
  pingResults: (id: number, params: { monitorId: number; limit?: number; since?: string }) =>
    api.get(`/vps/${id}/ping-results`, { params }),
};

// Notify API
export const notifyApi = {
  getConfig: () => api.get('/notify/config'),
  updateEmail: (data: NotifyEmailConfig) => api.put('/notify/config/email', data),
  updateTelegram: (data: NotifyTelegramConfig) => api.put('/notify/config/telegram', data),
  test: (channel: string, recipient?: string) =>
    api.post(`/notify/test/${channel}`, { recipient }),
  history: (params?: { page?: number; pageSize?: number }) =>
    api.get('/notify/history', { params }),
};

// System API
export const systemApi = {
  settings: () => api.get('/system/settings'),
  updateSetting: (key: string, value: unknown) => api.put(`/system/settings/${key}`, { value }),
  agentCheckConfig: () => api.get('/system/agent-check-config'),
  updateAgentCheckConfig: (data: { checkInterval: number; offlineThreshold: number }) =>
    api.put('/system/agent-check-config', data),
  auditLogs: (params?: { page?: number; pageSize?: number }) =>
    api.get('/system/audit-logs', { params }),
  groups: () => api.get('/system/groups'),
  createGroup: (data: { name: string; description?: string }) =>
    api.post('/system/groups', data),
  updateGroup: (id: number, data: { name: string; description?: string }) =>
    api.put(`/system/groups/${id}`, data),
  groupVps: (id: number) => api.get(`/system/groups/${id}/vps`),
  updateGroupVps: (id: number, vpsIds: number[]) =>
    api.put(`/system/groups/${id}/vps`, { vpsIds }),
  deleteGroup: (id: number) => api.delete(`/system/groups/${id}`),
  tags: () => api.get('/system/tags'),
  createTag: (data: { name: string; color?: string }) => api.post('/system/tags', data),
  updateTag: (id: number, data: { name: string; color?: string }) =>
    api.put(`/system/tags/${id}`, data),
  deleteTag: (id: number) => api.delete(`/system/tags/${id}`),
  overview: () => api.get('/system/overview'),
  metricsLatest: () => api.get('/system/metrics/latest'),
  networkMonitors: () => api.get('/system/network-monitors'),
  updateNetworkMonitors: (items: NetworkMonitorItem[]) => api.put('/system/network-monitors', { items }),
  applyNetworkMonitors: (vpsIds: number[]) => api.post('/system/network-monitors/apply', { vpsIds }),
  cleanup: () => api.post('/system/cleanup'),
};

// DD重装 API
export const ddApi = {
  getSupportedOS: () => api.get('/dd/supported-os'),
  start: (vpsId: number, data: {
    targetOs: string;
    targetVersion: string;
    newPassword: string;
    newSshPort: number;
  }, options?: { force?: boolean }) => api.post(
    `/dd/${vpsId}/start`,
    data,
    options?.force ? { params: { force: 'true' } } : undefined
  ),
  getTaskStatus: (taskId: number) => api.get(`/dd/task/${taskId}`),
  getHistory: (vpsId: number) => api.get(`/dd/${vpsId}/history`),
};

// 配置模块 API
export const configModuleApi = {
  get: (type: string) => api.get(`/config/modules/${type}`),
  update: (type: string, content: ConfigModuleContent) => api.put(`/config/modules/${type}`, { content }),
  rollback: (type: string) => api.post(`/config/modules/${type}/rollback`),
  sync: (type: string, targetVpsIds: number[]) =>
    api.post(`/config/modules/${type}/sync`, { targetVpsIds }),
  getVps: (type: string, vpsId: number) => api.get(`/config/modules/${type}/vps/${vpsId}`),
  updateVps: (type: string, vpsId: number, content: ConfigModuleContent) =>
    api.put(`/config/modules/${type}/vps/${vpsId}`, { content }),
};

// 软件管理 API
export const softwareApi = {
  list: () => api.get('/software'),
  get: (id: number) => api.get(`/software/${id}`),
  create: (data: SoftwarePayload) => api.post('/software', data),
  update: (id: number, data: SoftwarePayload) => api.put(`/software/${id}`, data),
  delete: (id: number) => api.delete(`/software/${id}`),
  install: (id: number, vpsIds: number[]) =>
    api.post(`/software/${id}/install`, { vpsIds }),
  uninstall: (id: number, vpsIds: number[]) =>
    api.post(`/software/${id}/uninstall`, { vpsIds }),
  status: (id: number, vpsId: number) => api.get(`/software/${id}/status/${vpsId}`),
  serviceStatus: (id: number, vpsId: number) => api.get(`/software/${id}/service/${vpsId}`),
  serviceAction: (id: number, vpsId: number, action: 'start' | 'stop' | 'restart') =>
    api.post(`/software/${id}/service/${vpsId}`, { action }),
  getConfig: (id: number, vpsId: number) => api.get(`/software/${id}/config/${vpsId}`),
  updateConfig: (id: number, vpsId: number, content: string) =>
    api.put(`/software/${id}/config/${vpsId}`, { content }),
  refreshAll: () => api.post('/software/refresh-all'),
  installations: (id: number, params?: { page?: number; pageSize?: number; vpsId?: number }) =>
    api.get(`/software/${id}/installations`, { params }),
  installBase: (vpsIds: number[]) => api.post('/software/install-base', { vpsIds }),
};
