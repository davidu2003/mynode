import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import * as agentService from './agent.service.js';

interface GeoInfo {
  publicIpv4: string | null;
  publicIpv6: string | null;
  countryCode: string | null;
  country: string | null;
}

interface IpApiResponse {
  status: string;
  country: string;
  countryCode: string;
}

// 内存队列：速率限制（ip-api.com 限制 45次/分钟，使用 1.5秒间隔）
const queue: Array<{ vpsId: number; resolve: (value: GeoInfo | null) => void }> = [];
let isProcessing = false;

async function processQueue(): Promise<void> {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;

  while (queue.length > 0) {
    const task = queue.shift();
    if (!task) break;

    try {
      const result = await fetchPublicIpAndGeo(task.vpsId);
      if (result) {
        await updateVpsGeoInfo(task.vpsId, result);
      }
      task.resolve(result);
    } catch (err) {
      console.error(`[GeoService] Failed to fetch geo for VPS ${task.vpsId}:`, err);
      task.resolve(null);
    }

    // 速率限制：每 1.5 秒处理一个请求（针对 ip-api.com）
    if (queue.length > 0) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  isProcessing = false;
}

/**
 * 通过 Agent 从被控服务器获取公网 IP
 */
async function fetchPublicIpFromAgent(vpsId: number): Promise<{ ipv4: string | null; ipv6: string | null }> {
  let ipv4: string | null = null;
  let ipv6: string | null = null;

  try {
    const agent = agentService.getAgent(vpsId);
    if (!agent) {
      return { ipv4: null, ipv6: null };
    }

    // 获取 IPv4
    try {
      const result = await agent.exec('curl -s --connect-timeout 5 https://api-ipv4.ip.sb/ip', 10000);
      if (result.exitCode === 0 && result.stdout.trim()) {
        const ip = result.stdout.trim();
        if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
          ipv4 = ip;
        }
      }
    } catch {
      // IPv4 获取失败
    }

    // 获取 IPv6
    try {
      const result = await agent.exec('curl -s --connect-timeout 5 https://api-ipv6.ip.sb/ip', 10000);
      if (result.exitCode === 0 && result.stdout.trim()) {
        const ip = result.stdout.trim();
        if (ip.includes(':')) {
          ipv6 = ip;
        }
      }
    } catch {
      // IPv6 获取失败（很多服务器没有 IPv6）
    }
  } catch (err) {
    console.error(`[GeoService] Failed to fetch public IP from agent for VPS ${vpsId}:`, err);
  }

  return { ipv4, ipv6 };
}

/**
 * 通过 ip-api.com 获取地理信息
 */
async function fetchGeoFromApi(ip: string): Promise<{ countryCode: string; country: string } | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`[GeoService] API returned ${response.status} for IP ${ip}`);
      return null;
    }

    const data = (await response.json()) as IpApiResponse;
    if (data.status !== 'success') {
      console.error(`[GeoService] API returned status ${data.status} for IP ${ip}`);
      return null;
    }

    return {
      countryCode: data.countryCode,
      country: data.country,
    };
  } catch (err) {
    console.error(`[GeoService] Fetch error for IP ${ip}:`, err);
    return null;
  }
}

/**
 * 获取公网 IP 和地理信息
 */
async function fetchPublicIpAndGeo(vpsId: number): Promise<GeoInfo | null> {
  // 1. 通过 Agent 获取公网 IP
  const { ipv4, ipv6 } = await fetchPublicIpFromAgent(vpsId);

  if (!ipv4 && !ipv6) {
    return null;
  }

  // 2. 使用获取到的公网 IP 查询地理信息（优先使用 IPv4）
  const ipForGeo = ipv4 || ipv6;
  let countryCode: string | null = null;
  let country: string | null = null;

  if (ipForGeo) {
    const geoResult = await fetchGeoFromApi(ipForGeo);
    if (geoResult) {
      countryCode = geoResult.countryCode;
      country = geoResult.country;
    }
  }

  return {
    publicIpv4: ipv4,
    publicIpv6: ipv6,
    countryCode,
    country,
  };
}

/**
 * 更新 VPS 的地理信息到数据库
 */
async function updateVpsGeoInfo(vpsId: number, geo: GeoInfo): Promise<void> {
  db.update(schema.vps)
    .set({
      publicIpv4: geo.publicIpv4,
      publicIpv6: geo.publicIpv6,
      countryCode: geo.countryCode,
      country: geo.country,
      geoUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.vps.id, vpsId))
    .run();
}

/**
 * 将地理信息获取任务加入队列（异步处理）
 */
export function queueGeoLookup(vpsId: number): void {
  // 避免重复加入队列
  if (queue.some((t) => t.vpsId === vpsId)) {
    return;
  }
  queue.push({
    vpsId,
    resolve: () => {},
  });
  processQueue();
}

/**
 * 刷新 VPS 的地理信息（供按需刷新使用）
 */
export async function refreshVpsGeo(vpsId: number): Promise<GeoInfo | null> {
  return new Promise((resolve) => {
    // 避免重复加入队列
    if (queue.some((t) => t.vpsId === vpsId)) {
      resolve(null);
      return;
    }
    queue.push({
      vpsId,
      resolve,
    });
    processQueue();
  });
}

/**
 * 检查并异步刷新过期的地理信息（1天有效期）
 * 只有 Agent 在线时才会刷新
 */
export function checkAndRefreshGeoIfNeeded(vpsId: number, geoUpdatedAt: Date | null, agentStatus: string | null): void {
  // 只有 Agent 在线才能获取公网 IP
  if (agentStatus !== 'online') {
    return;
  }

  const now = new Date();
  const oneDayMs = 24 * 60 * 60 * 1000;

  if (!geoUpdatedAt || now.getTime() - geoUpdatedAt.getTime() > oneDayMs) {
    queueGeoLookup(vpsId);
  }
}

/**
 * 批量检查并刷新过期的地理信息
 */
export function checkAndRefreshGeoForList(
  items: Array<{ id: number; geoUpdatedAt: Date | null; agentStatus: string | null }>
): void {
  for (const item of items) {
    checkAndRefreshGeoIfNeeded(item.id, item.geoUpdatedAt, item.agentStatus);
  }
}
