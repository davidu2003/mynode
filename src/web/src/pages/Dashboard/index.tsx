import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { LuWallet, LuServer, LuActivity, LuArrowRightLeft } from "react-icons/lu";
import { systemApi, vpsApi } from '../../api';
import { cn } from '../../lib/utils';

// UI Components
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import OSIcon from '../../components/OSIcon';
import CountryFlag from '../../components/CountryFlag';

// Types
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

interface VpsDashboardItem {
  id: number;
  name: string;
  ip: string;
  agentStatus: string;
  logo?: string;
  region?: string;
  location?: string;
  osType?: string;
  osVersion?: string;
  publicIpv4?: string;
  publicIpv6?: string;
  countryCode?: string;
  country?: string;
  billing?: {
    currency: string;
    amount: number;
    billingCycle?: string;
    cycleDays?: number;
    startDate?: string;
    expireDate?: string;
    traffic?: string;
    trafficGb?: number;
  };
}

const statusMap: Record<string, { text: string; variant: "success" | "destructive" | "warning" | "default" }> = {
  online: { text: '在线', variant: 'success' },
  offline: { text: '离线', variant: 'destructive' },
  pending: { text: '待安装', variant: 'warning' },
  installing: { text: '安装中', variant: 'default' },
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

function nameInitial(name?: string): string {
  return (name || '').trim().slice(0, 1).toUpperCase() || '?';
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

function progressColorByRemaining(percentRemaining: number): string {
  if (percentRemaining <= 10) return '#ff4d4f';
  if (percentRemaining <= 30) return '#fa8c16';
  if (percentRemaining <= 50) return '#faad14';
  return '#52c41a';
}

const CompactProgress = ({ percent, text, color }: { percent: number; text: string; color: string }) => (
  <div className="relative w-full h-4 bg-slate-200 dark:bg-slate-700 rounded-sm overflow-hidden">
    <div
      className="h-full transition-all duration-500"
      style={{ width: `${Math.min(100, Math.max(0, percent))}%`, backgroundColor: color }}
    />
    <div className="absolute inset-0 flex items-center justify-center">
      <span className="text-[10px] font-bold text-white drop-shadow-[0_0_2px_rgba(0,0,0,0.8)] px-1 whitespace-nowrap">
        {text}
      </span>
    </div>
  </div>
);

export default function Dashboard() {
  const navigate = useNavigate();

  // Data Fetching
  const { data: metricsData, isLoading: metricsLoading } = useQuery({
    queryKey: ['dashboard', 'metrics'],
    queryFn: async () => (await systemApi.metricsLatest()).data.items || [],
    refetchInterval: 10000,
  });

  const { data: vpsData, isLoading: vpsLoading } = useQuery({
    queryKey: ['dashboard', 'vps'],
    queryFn: async () => (await vpsApi.list({ page: 1, pageSize: 200 })).data.items || [],
    refetchInterval: 10000,
  });

  const latestMetrics: LatestMetricItem[] = metricsData || [];
  const vpsList: VpsDashboardItem[] = vpsData || [];
  
  const metricsMap = new Map(latestMetrics.map(item => [item.id, item]));

  // Summary Calculation
  const summary = (() => {
    const total = vpsList.length;
    // Use metric status if available for online count, otherwise fallback to vps list status
    const online = vpsList.filter((v) => {
      const m = metricsMap.get(v.id);
      return (m?.agentStatus || v.agentStatus) === 'online';
    }).length;
    const offline = total - online; // Simplified offline count
    
    const totalTrafficIn = latestMetrics.reduce((acc, item) => acc + (item.monthUsedInBytes || 0), 0);
    const totalTrafficOut = latestMetrics.reduce((acc, item) => acc + (item.monthUsedOutBytes || 0), 0);
    const speedIn = latestMetrics.reduce((acc, item) => acc + (item.speedInBps || 0), 0);
    const speedOut = latestMetrics.reduce((acc, item) => acc + (item.speedOutBps || 0), 0);

    // Cost Calculation - 年度费用估算
    const totalCostByCurrency: Record<string, number> = {};

    vpsList.forEach((v) => {
      const billing = v.billing;
      if (typeof billing?.amount !== 'number' || !billing?.currency) return;

      const cycleMap: Record<string, number> = {
        'monthly': 30, 'quarterly': 90, 'semi-annually': 180,
        'annually': 365, 'biennially': 730, 'triennially': 1095
      };

      let periodDays = billing.cycleDays || cycleMap[billing.billingCycle?.toLowerCase() || ''] || 30;
      if (periodDays <= 0) periodDays = 30;

      // 直接按周期折算年度费用：年费 = 单次费用 * (365 / 周期天数)
      const costForYear = (billing.amount * 365) / periodDays;

      if (costForYear > 0) {
        totalCostByCurrency[billing.currency] = (totalCostByCurrency[billing.currency] || 0) + costForYear;
      }
    });

    const costLabel = Object.keys(totalCostByCurrency).length
      ? Object.entries(totalCostByCurrency)
          .map(([curr, amt]) => `${amt.toFixed(2)} ${curr}`)
          .join(' + ')
      : '0.00';

    return { total, online, offline, totalTrafficIn, totalTrafficOut, speedIn, speedOut, costLabel };
  })();

  if (metricsLoading || vpsLoading) {
    return <div className="p-8 text-center text-slate-500">加载中...</div>;
  }

  // Define grid columns layout
  // Adjusted for compact progress bars
  const gridCols = "grid-cols-[40px_60px_1.5fr_0.8fr_0.8fr_1fr_1fr_1fr_0.6fr_0.8fr_0.8fr_0.8fr_0.8fr_1fr_0.8fr_1fr]";

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">仪表盘</h2>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <LuWallet className="h-4 w-4" />
              全局资产总览 (本年度)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.costLabel}</div>
            <p className="text-xs text-slate-500">
              预计年度总支出
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <LuServer className="h-4 w-4" />
              在线服务器
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.online} <span className="text-sm font-normal text-slate-500">/ {summary.total}</span></div>
            <p className="text-xs text-slate-500">
              离线: {summary.offline}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <LuActivity className="h-4 w-4" />
              实时网络速率
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatSpeed(summary.speedOut)} <span className="text-xs text-slate-500">↑</span></div>
             <div className="text-sm font-medium text-slate-600">{formatSpeed(summary.speedIn)} <span className="text-xs text-slate-500">↓</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <LuArrowRightLeft className="h-4 w-4" />
              月流量消耗
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(summary.totalTrafficOut)} <span className="text-xs text-slate-500">出</span></div>
            <div className="text-sm font-medium text-slate-600">{formatBytes(summary.totalTrafficIn)} <span className="text-xs text-slate-500">入</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Modern Grid List for Servers */}
      <div className="rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50 overflow-x-auto">
        <div className="min-w-[1400px]">
          {/* Header */}
          <div className={`grid ${gridCols} gap-2 p-4 border-b border-slate-200 bg-slate-50/50 text-xs font-medium text-slate-500 uppercase tracking-wider dark:border-slate-800 dark:bg-slate-900/50`}>
            <div>状态</div>
            <div>商家</div>
            <div>名称</div>
            <div className="text-center">地区</div>
            <div className="text-center">系统</div>
            <div>CPU</div>
            <div>内存</div>
            <div>硬盘</div>
            <div>负载</div>
            <div className="text-right">今日(上)</div>
            <div className="text-right">今日(下)</div>
            <div className="text-right">速率(上)</div>
            <div className="text-right">速率(下)</div>
            <div>流量剩余</div>
            <div>价格</div>
            <div>到期</div>
          </div>
          
          {/* Rows */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {vpsList.map((vps) => {
              const metricItem = metricsMap.get(vps.id);
              const metric = metricItem?.metric;
              // Prefer status from real-time metrics if available
              const currentStatus = metricItem?.agentStatus || vps.agentStatus || 'offline';
              const status = statusMap[currentStatus] || statusMap.offline;
              
              // Traffic Calculation
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

              // Expiry Calculation
              const expireDate = vps.billing?.expireDate ? new Date(vps.billing.expireDate) : null;
              const now = new Date();
              let remainingDays: number | null = null;
              let expiryPercent = 0;

              if (expireDate) {
                 const diffTime = expireDate.getTime() - now.getTime();
                 remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                 expiryPercent = remainingDays > 30 ? 100 : Math.max(0, (remainingDays / 30) * 100);
              }

              return (
                <div 
                  key={vps.id} 
                  className={`grid ${gridCols} gap-2 p-4 items-center hover:bg-slate-50/80 transition-colors dark:hover:bg-slate-900/50 text-sm`}
                >
                  {/* Status */}
                  <div>
                    <span className={cn(
                      "flex h-2.5 w-2.5 rounded-full",
                      status.variant === 'success' ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" :
                      status.variant === 'destructive' ? "bg-red-500" :
                      status.variant === 'warning' ? "bg-yellow-500" : "bg-slate-500"
                    )} />
                  </div>
                  
                  {/* Vendor */}
                  <div className="flex items-center">
                    {vps.logo ? (
                        <img src={vps.logo} alt="" className="h-2.5 w-auto rounded object-contain" />
                    ) : (
                        <div className="flex h-2.5 w-2.5 items-center justify-center rounded bg-slate-100 text-[8px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          {nameInitial(vps.name)}
                        </div>
                    )}
                  </div>

                  {/* Name */}
                  <div className="flex items-center gap-2 font-medium overflow-hidden">
                    <span 
                      className="cursor-pointer hover:text-blue-600 truncate"
                      onClick={() => navigate(`/servers/${vps.id}?tab=metrics`)}
                      title={vps.name}
                    >
                      {vps.name}
                    </span>
                  </div>

                  {/* Region */}
                  <div className="flex items-center justify-center">
                    <CountryFlag countryCode={vps.countryCode} size="md" />
                  </div>

                  {/* OS */}
                  <div className="flex items-center justify-center" title={`${vps.osType || ''} ${vps.osVersion || ''}`}>
                    <OSIcon osType={vps.osType} />
                  </div>

                  {/* CPU */}
                  <div className="w-full">
                    {metric?.cpuUsage != null ? (
                      <CompactProgress 
                        percent={metric.cpuUsage} 
                        text={`${metric.cpuUsage.toFixed(0)}%`}
                        color={metric.cpuUsage > 80 ? '#ef4444' : '#3b82f6'} 
                      />
                    ) : <span className="text-slate-300">-</span>}
                  </div>

                  {/* Mem */}
                  <div className="w-full">
                    {metric?.memUsage != null ? (
                      <CompactProgress 
                        percent={metric.memUsage} 
                        text={`${metric.memUsage.toFixed(0)}%`}
                        color={metric.memUsage > 80 ? '#ef4444' : '#8b5cf6'} 
                      />
                    ) : <span className="text-slate-300">-</span>}
                  </div>

                  {/* Disk */}
                  <div className="w-full">
                    {metric?.diskUsage != null ? (
                      <CompactProgress 
                        percent={metric.diskUsage} 
                        text={`${metric.diskUsage.toFixed(0)}%`}
                        color={metric.diskUsage > 90 ? '#ef4444' : '#10b981'} 
                      />
                    ) : <span className="text-slate-300">-</span>}
                  </div>

                  {/* Load */}
                  <div className="font-mono text-xs text-slate-600 dark:text-slate-400">
                    {metric?.load1 != null ? metric.load1.toFixed(2) : '-'}
                  </div>

                  {/* Today Upload */}
                  <div className="text-right font-mono text-xs text-slate-600 dark:text-slate-400">
                    {formatBytes(metricItem?.dayUsedOutBytes)}
                  </div>
                  
                  {/* Today Download */}
                  <div className="text-right font-mono text-xs text-slate-600 dark:text-slate-400">
                    {formatBytes(metricItem?.dayUsedInBytes)}
                  </div>

                  {/* Speed Out */}
                  <div className="text-right font-mono text-xs text-slate-600 dark:text-slate-400">
                    {formatSpeed(metricItem?.speedOutBps)}
                  </div>
                  
                  {/* Speed In */}
                  <div className="text-right font-mono text-xs text-slate-600 dark:text-slate-400">
                    {formatSpeed(metricItem?.speedInBps)}
                  </div>
                  
                  {/* Traffic Remaining */}
                  <div className="w-full">
                    {remainingGb !== null ? (
                      <CompactProgress 
                        percent={remainingPercent} 
                        text={`${remainingGb.toFixed(0)}GB`}
                        color={progressColorByRemaining(remainingPercent)} 
                      />
                    ) : (
                      <span className="text-slate-300 text-xs">-</span>
                    )}
                  </div>

                  {/* Price */}
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    {vps.billing ? `${vps.billing.amount} ${vps.billing.currency}` : '-'}
                  </div>

                  {/* Expiry */}
                  <div className="w-full">
                     {expireDate && remainingDays !== null ? (
                        <div title={`${dayjs(expireDate).format('YYYY-MM-DD')} (剩余 ${remainingDays} 天)`}>
                          <CompactProgress 
                            percent={expiryPercent} 
                            text={`${remainingDays}d`}
                            color={remainingDays <= 7 ? '#ef4444' : '#22c55e'} 
                          />
                        </div>
                     ) : <span className="text-slate-300 text-xs">-</span>}
                  </div>
                </div>
              );
            })}
            
            {vpsList.length === 0 && (
              <div className="p-8 text-center text-slate-500">
                暂无服务器数据
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
