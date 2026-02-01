import { useEffect, useMemo, useRef, useState } from 'react';
import { Spin, Tag, Progress, Tooltip } from 'antd';
import { systemApi, vpsApi } from '../../api';
import { useNavigate } from 'react-router-dom';
import { AndroidOutlined, AppleOutlined, DesktopOutlined, LinuxOutlined, WindowsOutlined } from '@ant-design/icons';
import { useThemeStore } from '../../stores/theme';

interface LatestMetricItem {
  id: number;
  name: string;
  ip: string;
  agentStatus: string;
  metric: {
    cpuUsage: number | null;
    memUsage: number | null;
    diskUsage: number | null;
    netIn: number | null;
    netOut: number | null;
    load1: number | null;
    load5: number | null;
    load15: number | null;
    collectedAt: string;
  } | null;
  speedInBps?: number;
  speedOutBps?: number;
  monthUsedBytes?: number;
  monthUsedInBytes?: number;
  monthUsedOutBytes?: number;
  dayUsedBytes?: number;
  dayUsedInBytes?: number;
  dayUsedOutBytes?: number;
  cycleUsedBytes?: number;
}

const statusMap: Record<string, { text: string; color: string }> = {
  online: { text: '在线', color: 'green' },
  offline: { text: '离线', color: 'red' },
  pending: { text: '待安装', color: 'orange' },
  installing: { text: '安装中', color: 'blue' },
};

function formatBytes(value?: number | null): string {
  if (value === null || value === undefined) return '-';
  if (value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function formatSpeed(value?: number | null): string {
  if (!value || value <= 0) return '-';
  return `${formatBytes(value)}/s`;
}

function parseTrafficToGb(value?: string | null): number | null {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)(tb|gb|mb)?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = match[2] || 'gb';
  if (unit === 'tb') return amount * 1024;
  if (unit === 'mb') return amount / 1024;
  return amount;
}

function daysBetween(start: Date, end: Date): number {
  return Math.max((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000), 0);
}

type BillingInfo = {
  cycleDays?: number;
  billingCycle?: string;
  amount?: number;
  currency?: string;
  startDate?: string;
  expireDate?: string;
  trafficGb?: number;
  traffic?: string;
  trafficCycle?: string;
};

type TagItem = { id: number; name: string; color: string };

type VpsListItem = {
  id: number;
  name: string;
  ip: string;
  agentStatus?: string;
  osType?: string;
  osVersion?: string;
  arch?: string;
  tags?: TagItem[];
  billing?: BillingInfo;
  region?: string;
  location?: string;
  area?: string;
  logo?: string;
};

function cycleDaysFromBilling(billing: BillingInfo | null | undefined): number | null {
  if (!billing) return null;
  if (typeof billing.cycleDays === 'number' && billing.cycleDays > 0) {
    return billing.cycleDays;
  }
  if (!billing.billingCycle) return null;
  const cycle = String(billing.billingCycle).toLowerCase();
  if (cycle === 'monthly') return 30;
  if (cycle === 'quarterly') return 90;
  if (cycle === 'yearly') return 365;
  return null;
}

function osBadge(label: string, background: string, color: string) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 28,
        height: 22,
        padding: '0 6px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.3,
        background,
        color,
      }}
    >
      {label}
    </span>
  );
}

function nameInitial(name?: string): string {
  const value = (name || '').trim();
  if (!value) return '?';
  return value.slice(0, 1).toUpperCase();
}

function osIcon(osType?: string | null) {
  const normalized = (osType || '').toLowerCase();
  if (normalized.includes('debian')) return osBadge('DEB', '#e2185b', '#fff');
  if (normalized.includes('ubuntu')) return osBadge('UBU', '#f05a28', '#fff');
  if (normalized.includes('windows')) return <WindowsOutlined />;
  if (normalized.includes('mac') || normalized.includes('darwin') || normalized.includes('osx')) {
    return <AppleOutlined />;
  }
  if (normalized.includes('android')) return <AndroidOutlined />;
  if (
    normalized.includes('linux') ||
    normalized.includes('centos') ||
    normalized.includes('alpine') ||
    normalized.includes('fedora') ||
    normalized.includes('arch')
  ) {
    return <LinuxOutlined />;
  }
  return <DesktopOutlined />;
}

function progressColorByRemaining(percentRemaining: number): string {
  if (percentRemaining <= 10) return '#ff4d4f';
  if (percentRemaining <= 30) return '#fa8c16';
  if (percentRemaining <= 50) return '#faad14';
  return '#52c41a';
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [latestMetrics, setLatestMetrics] = useState<LatestMetricItem[]>([]);
  const [vpsList, setVpsList] = useState<VpsListItem[]>([]);
  const [tags, setTags] = useState<{ id: number; name: string; color: string }[]>([]);
  const [activeTag, setActiveTag] = useState<number | 'all'>('all');
  const [hasLoaded, setHasLoaded] = useState(false);
  const hasLoadedRef = useRef(false);
  const navigate = useNavigate();
  const isDark = useThemeStore((state) => state.isDark);

  const metricsMap = useMemo(() => {
    const map = new Map<number, LatestMetricItem>();
    latestMetrics.forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [latestMetrics]);

  const filteredServers = useMemo(() => {
    if (activeTag === 'all') return vpsList;
    return vpsList.filter((vps) => vps.tags?.some((tag: TagItem) => tag.id === activeTag));
  }, [vpsList, activeTag]);

  const summary = useMemo(() => {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearEnd = new Date(now.getFullYear() + 1, 0, 1);
    const yearDays = daysBetween(yearStart, yearEnd) || 365;
    const total = vpsList.length;
    const online = vpsList.filter((v) => v.agentStatus === 'online').length;
    const offline = vpsList.filter((v) => v.agentStatus === 'offline').length;
    const totalCostByCurrency: Record<string, number> = {};
    vpsList.forEach((v) => {
      const billing = v.billing;
      if (typeof billing?.amount !== 'number' || !billing?.currency) {
        return;
      }
      const startDate = billing.startDate ? new Date(billing.startDate) : null;
      const expireDate = billing.expireDate ? new Date(billing.expireDate) : null;
      let periodDays: number | null = null;
      if (startDate && expireDate) {
        periodDays = daysBetween(startDate, expireDate);
      }
      if (!periodDays) {
        periodDays = cycleDaysFromBilling(billing);
      }
      if (!periodDays) {
        return;
      }
      let costForYear = 0;
      if (startDate && expireDate) {
        const overlapStart = startDate > yearStart ? startDate : yearStart;
        const overlapEnd = expireDate < yearEnd ? expireDate : yearEnd;
        const overlapDays = daysBetween(overlapStart, overlapEnd);
        if (overlapDays > 0) {
          costForYear = (billing.amount * overlapDays) / periodDays;
        }
      } else {
        costForYear = (billing.amount * yearDays) / periodDays;
      }
      if (costForYear > 0) {
        totalCostByCurrency[billing.currency] =
          (totalCostByCurrency[billing.currency] || 0) + costForYear;
      }
    });
    const costLabel = Object.keys(totalCostByCurrency).length
      ? Object.entries(totalCostByCurrency)
          .map(([currency, amount]) => `${amount.toFixed(2)} ${currency}`)
          .join(' / ')
      : '-';
    const totalTrafficIn = latestMetrics.reduce((acc, item) => acc + (item.monthUsedInBytes || 0), 0);
    const totalTrafficOut = latestMetrics.reduce((acc, item) => acc + (item.monthUsedOutBytes || 0), 0);
    const todayTrafficIn = latestMetrics.reduce((acc, item) => acc + (item.dayUsedInBytes || 0), 0);
    const todayTrafficOut = latestMetrics.reduce((acc, item) => acc + (item.dayUsedOutBytes || 0), 0);
    const speedIn = latestMetrics.reduce((acc, item) => acc + (item.speedInBps || 0), 0);
    const speedOut = latestMetrics.reduce((acc, item) => acc + (item.speedOutBps || 0), 0);
    const regionCount = new Set(
      vpsList
        .map((v) => v.region || v.location || v.area)
        .filter((value: string | null | undefined) => Boolean(value))
    ).size;
    return {
      total,
      online,
      offline,
      costLabel,
      totalTrafficIn,
      totalTrafficOut,
      todayTrafficIn,
      todayTrafficOut,
      speedIn,
      speedOut,
      regionCount,
    };
  }, [vpsList, latestMetrics]);

  const palette = useMemo(
    () => ({
      border: isDark ? '#2a2c2f' : '#e6e8eb',
      card: isDark ? '#14171a' : '#ffffff',
      header: isDark ? '#111315' : '#f7f8fa',
      textMuted: isDark ? '#9aa0a6' : '#666',
      chip: isDark ? '#1a1d21' : '#f3f4f6',
    }),
    [isDark]
  );

  useEffect(() => {
    const fetchDashboard = async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const [metricsRes, vpsRes, tagsRes] = await Promise.all([
          systemApi.metricsLatest(),
          vpsApi.list({ page: 1, pageSize: 200 }),
          systemApi.tags(),
        ]);
        setLatestMetrics(metricsRes.data.items || []);
        setVpsList(vpsRes.data.items || []);
        setTags(tagsRes.data.items || []);
        if (!hasLoadedRef.current) {
          hasLoadedRef.current = true;
          setHasLoaded(true);
        }
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    };

    fetchDashboard();
    const timer = window.setInterval(() => fetchDashboard(true), 10000);
    return () => window.clearInterval(timer);
  }, []);

  if (loading && !hasLoaded) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>仪表盘</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {[
          { label: '全局资产总览', value: summary.costLabel },
          { label: '在线', value: summary.online },
          { label: '离线', value: summary.offline },
          { label: '节点区域', value: summary.regionCount || '-' },
          { label: '总 ↑', value: formatBytes(summary.totalTrafficIn) },
          { label: '总 ↓', value: formatBytes(summary.totalTrafficOut) },
          { label: '今 ↑', value: formatBytes(summary.todayTrafficIn) },
          { label: '今 ↓', value: formatBytes(summary.todayTrafficOut) },
          { label: '上行速率', value: formatSpeed(summary.speedOut) },
          { label: '下行速率', value: formatSpeed(summary.speedIn) },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 999,
              border: `1px solid ${palette.border}`,
              background: palette.chip,
              fontSize: 12,
            }}
          >
            <span style={{ color: palette.textMuted }}>{item.label}：</span>
            <span style={{ fontWeight: 600 }}>{item.value}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <Tag
          color={activeTag === 'all' ? 'processing' : 'default'}
          style={{ cursor: 'pointer' }}
          onClick={() => setActiveTag('all')}
        >
          所有
        </Tag>
        {tags.map((tag) => (
          <Tag
            key={tag.id}
            color={activeTag === tag.id ? 'processing' : tag.color}
            style={{ cursor: 'pointer' }}
            onClick={() => setActiveTag(tag.id)}
          >
            {tag.name}
          </Tag>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div
          style={{
            minWidth: 1600,
            display: 'grid',
            gridTemplateColumns:
              '40px 190px 70px 70px 110px 110px 110px 60px 88px 88px 90px 90px 100px 80px 110px',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 8,
            border: `1px solid ${palette.border}`,
            background: palette.header,
            fontSize: 12,
            fontWeight: 600,
            color: palette.textMuted,
          }}
        >
          <div>状态</div>
          <div>名称</div>
          <div>地区</div>
          <div>系统</div>
          <div>CPU</div>
          <div>内存</div>
          <div>硬盘</div>
          <div>负载</div>
          <div>今日 ↑</div>
          <div>今日 ↓</div>
          <div>上行速率</div>
          <div>下行速率</div>
          <div>流量剩余</div>
          <div>价格</div>
          <div>到期</div>
        </div>

        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          {filteredServers.map((vps) => {
            const metricItem = metricsMap.get(vps.id);
            const metric = metricItem?.metric;
            const status = statusMap[vps.agentStatus || ''] || { text: vps.agentStatus || '未知', color: 'default' };
            const trafficTotalGb = typeof vps.billing?.trafficGb === 'number'
              ? vps.billing.trafficGb
              : parseTrafficToGb(vps.billing?.traffic);
            const cycleUsedBytes = metricItem?.cycleUsedBytes ?? metricItem?.monthUsedBytes ?? 0;
            const cycleUsedGb = cycleUsedBytes / (1024 * 1024 * 1024);
            const remainingGb = trafficTotalGb !== null ? Math.max(trafficTotalGb - cycleUsedGb, 0) : null;
            const remainingPercent =
              trafficTotalGb && trafficTotalGb > 0 && remainingGb !== null
                ? Math.min((remainingGb / trafficTotalGb) * 100, 100)
                : 0;
            const expireDate = vps.billing?.expireDate ? new Date(vps.billing.expireDate) : null;
            const startDate = vps.billing?.startDate ? new Date(vps.billing.startDate) : null;
            const now = new Date();
            let totalDays: number | null = null;
            let remainingDays: number | null = null;

            const cycle = String(vps.billing?.billingCycle || '').toLowerCase();
            if (expireDate && cycle === 'monthly') {
              totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
              remainingDays = Math.max(
                Math.ceil((expireDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
                0
              );
              if (totalDays) {
                remainingDays = Math.min(remainingDays, totalDays);
              }
            } else if (expireDate && startDate) {
              totalDays = Math.max((expireDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000), 1);
              const elapsedDays = Math.max((now.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000), 0);
              remainingDays = Math.max(Math.ceil(totalDays - elapsedDays), 0);
            } else if (expireDate) {
              const cycleDays = cycleDaysFromBilling(vps.billing);
              totalDays = cycleDays || null;
              const diffDays = Math.max(
                Math.ceil((expireDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
                0
              );
              remainingDays = totalDays ? Math.min(diffDays, totalDays) : diffDays;
            }

            const expiryPercent =
              totalDays && remainingDays !== null ? Math.min((remainingDays / totalDays) * 100, 100) : 0;
            const isOnline = vps.agentStatus === 'online';

            return (
              <div
                key={vps.id}
                style={{
                  minWidth: 1600,
                  display: 'grid',
                  gridTemplateColumns:
                    '40px 190px 70px 70px 110px 110px 110px 60px 88px 88px 90px 90px 100px 80px 110px',
                  gap: 8,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${palette.border}`,
                  background: palette.card,
                  alignItems: 'center',
                }}
              >
                <div>
                  <Tooltip title={status.text}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: isOnline ? '#52c41a' : '#ff4d4f',
                        boxShadow: isOnline ? '0 0 6px rgba(82,196,26,0.45)' : undefined,
                      }}
                    />
                  </Tooltip>
                </div>
                  <div>
                    <div
                      style={{ fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                      onClick={() => navigate(`/servers/${vps.id}?tab=metrics`)}
                    >
                    {vps.logo ? (
                      <img
                        src={vps.logo}
                        alt=""
                        style={{
                          height: 20,
                          width: 'auto',
                          maxWidth: 28,
                          borderRadius: 6,
                          marginRight: 6,
                          display: 'block',
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 20,
                          height: 20,
                          borderRadius: 6,
                          marginRight: 6,
                          background: palette.header,
                          color: palette.textMuted,
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {nameInitial(vps.name)}
                      </span>
                    )}
                    {vps.name}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: palette.textMuted }}>-</div>
                <div style={{ fontSize: 12 }}>
                  <Tooltip title={vps.osType ? `${vps.osType} ${vps.osVersion || ''}` : '未知'}>
                    <span style={{ fontSize: 16 }}>{osIcon(vps.osType)}</span>
                  </Tooltip>
                </div>
                <div>
                  {typeof metric?.cpuUsage === 'number' ? (
                    <Progress
                      percent={Number(metric.cpuUsage.toFixed(1))}
                      size="small"
                      showInfo
                      format={(value) => `${value}%`}
                      strokeColor={progressColorByRemaining(100 - metric.cpuUsage)}
                    />
                  ) : (
                    '-'
                  )}
                </div>
                <div>
                  {typeof metric?.memUsage === 'number' ? (
                    <Progress
                      percent={Number(metric.memUsage.toFixed(1))}
                      size="small"
                      showInfo
                      format={(value) => `${value}%`}
                      strokeColor={progressColorByRemaining(100 - metric.memUsage)}
                    />
                  ) : (
                    '-'
                  )}
                </div>
                <div>
                  {typeof metric?.diskUsage === 'number' ? (
                    <Progress
                      percent={Number(metric.diskUsage.toFixed(1))}
                      size="small"
                      showInfo
                      format={(value) => `${value}%`}
                      strokeColor={progressColorByRemaining(100 - metric.diskUsage)}
                    />
                  ) : (
                    '-'
                  )}
                </div>
                <div style={{ fontSize: 12 }}>
                  {metric?.load1 !== null && metric?.load1 !== undefined ? metric.load1.toFixed(2) : '-'}
                </div>
                <div style={{ fontSize: 12 }}>{formatBytes(metricItem?.dayUsedOutBytes)}</div>
                <div style={{ fontSize: 12 }}>{formatBytes(metricItem?.dayUsedInBytes)}</div>
                <div style={{ fontSize: 12 }}>{formatSpeed(metricItem?.speedOutBps)}</div>
                <div style={{ fontSize: 12 }}>{formatSpeed(metricItem?.speedInBps)}</div>
                <div>
                  {remainingGb !== null ? (
                    <Progress
                      percent={Number(remainingPercent.toFixed(1))}
                      size="small"
                      showInfo
                      format={() => `${remainingGb.toFixed(1)} GB`}
                      strokeColor={progressColorByRemaining(remainingPercent)}
                    />
                  ) : (
                    '-'
                  )}
                </div>
                <div style={{ fontSize: 12 }}>
                  {vps.billing ? `${vps.billing.amount} ${vps.billing.currency}` : '-'}
                </div>
                <div>
                  {expireDate && remainingDays !== null ? (
                    <Tooltip title={`剩余 ${remainingDays} 天`}>
                      <Progress
                        percent={Number(expiryPercent.toFixed(1))}
                        size="small"
                        showInfo={false}
                        strokeColor={progressColorByRemaining(expiryPercent)}
                      />
                    </Tooltip>
                  ) : (
                    '-'
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
