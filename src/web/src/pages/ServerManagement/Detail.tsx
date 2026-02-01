import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  EditOutlined,
  CodeOutlined,
  CopyOutlined,
  CloudDownloadOutlined,
  SyncOutlined,
  ReloadOutlined,
  RobotOutlined
} from '@ant-design/icons';
import { 
  LuInfo, 
  LuHardDrive, 
  LuNetwork, 
  LuTags, 
  LuCreditCard, 
  LuCpu, 
  LuCircuitBoard, 
  LuArrowUpDown, 
  LuClock,
  LuActivity,
  LuDatabase
} from "react-icons/lu";
import { message, Modal } from 'antd'; // Keeping AntD Modal for complex interactions for now

import { vpsApi } from '../../api';
import { getErrorMessage } from '../../utils/api-error';
import DDModal, { DDHistory } from '../../components/DDModal';
import LineChart from '../../components/LineChart';
import type { LineChartRef } from '../../components/LineChart';
import { cn } from '../../lib/utils';

// UI Components
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog'; // Using shadcn Dialog for simple ones
import { Input } from '../../components/ui/input';

import OSIcon from '../../components/OSIcon';
import CountryFlag from '../../components/CountryFlag';

// Types
type VpsTag = { id: number; name: string; color?: string };
type VpsGroup = { id: number; name: string };

type DiskInfo = {
  path: string;
  fsType?: string;
  total?: number;
  used?: number;
  usedPercent?: number;
};

type NetworkInfo = {
  name: string;
  addrs?: string[];
};

type VpsSystemInfo = {
  kernel?: string;
  cpuModel?: string;
  cpuCores?: number;
  cpuThreads?: number;
  memTotal?: number;
  memAvailable?: number;
  disks?: DiskInfo[];
  networks?: NetworkInfo[];
};

type VpsBilling = {
  amount: number;
  currency: string;
  bandwidth?: string;
  traffic?: string;
  trafficGb?: number;
  trafficCycle?: string;
  route?: string;
  billingCycle?: string;
  startDate?: string;
  expireDate?: string;
  autoRenew?: boolean;
};

type Vps = {
  id: number;
  name: string;
  ip: string;
  sshPort?: number;
  authType?: 'password' | 'key';
  logo?: string;
  vendorUrl?: string;
  groupId?: number | null;
  agentToken?: string;
  agentStatus?: string;
  osType?: string;
  osVersion?: string;
  arch?: string;
  publicIpv4?: string;
  publicIpv6?: string;
  countryCode?: string;
  country?: string;
  systemInfo?: VpsSystemInfo;
  billing?: VpsBilling;
  tags?: VpsTag[];
  groups?: VpsGroup[];
};

type Metric = {
  collectedAt: string | number;
  cpuUsage?: number;
  memUsage?: number;
  diskUsage?: number;
  netIn?: number;
  netOut?: number;
  diskReadBytes?: number;
  diskWriteBytes?: number;
  load1?: number;
  load5?: number;
  load15?: number;
};

type PingMonitor = {
  id: number;
  name: string;
  type: 'icmp' | 'tcp';
  target: string;
  port?: number;
  interval?: number;
};

type PingResult = {
  collectedAt: string | number;
  success?: boolean;
  latency?: number;
  error?: string;
};

const statusMap: Record<string, { text: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" }> = {
  online: { text: '在线', variant: 'success' },
  offline: { text: '离线', variant: 'destructive' },
  pending: { text: '待安装', variant: 'warning' },
  installing: { text: '安装中', variant: 'default' },
};

// Helper Functions
const formatBytes = (value?: number | null) => {
  if (!value || value <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

const formatBytesPerSec = (value: number) => {
    if (!value || value <= 0) return '0 B/s';
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
    let size = value;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
};

export default function ServerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [execModalOpen, setExecModalOpen] = useState(false);
  const [ddModalVisible, setDDModalVisible] = useState(false);
  
  const [command, setCommand] = useState('');
  const [execResult, setExecResult] = useState<string>('');
  
  const [timeRange, setTimeRange] = useState('6h');
  const [isAnyChartZoomed, setIsAnyChartZoomed] = useState(false);
  
  // Refs
  const cpuChartRef = useRef<LineChartRef>(null);
  const memChartRef = useRef<LineChartRef>(null);
  const diskIoChartRef = useRef<LineChartRef>(null);
  const networkChartRef = useRef<LineChartRef>(null);
  const loadChartRef = useRef<LineChartRef>(null);
  const diskUsageChartRef = useRef<LineChartRef>(null);

  const activeTab = searchParams.get('tab') || 'info';

  // --- Data Fetching ---
  const { data: vps, isLoading: vpsLoading } = useQuery({
    queryKey: ['vps', id],
    queryFn: async () => (await vpsApi.get(Number(id))).data as Vps,
    refetchInterval: 10000,
  });

  const calcSince = (now: number) => {
    const map: Record<string, number> = {
      '1h': 1, '3h': 3, '6h': 6, '12h': 12, '24h': 24
    };
    const hours = map[timeRange];
    if (hours) return new Date(now - hours * 60 * 60 * 1000).toISOString();
    if (timeRange === '7d') return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    return new Date(now - 6 * 60 * 60 * 1000).toISOString();
  };

  const { data: metricsData } = useQuery({
    queryKey: ['vps', id, 'metrics', timeRange],
    queryFn: async () => {
      const now = Date.now();
      return (await vpsApi.metrics(Number(id), { limit: 20000, since: calcSince(now) })).data.items || [];
    },
    refetchInterval: 10000,
    staleTime: 0,
    gcTime: 0, // 切换 ID 时立即清除缓存（原 cacheTime）
  });
  const metrics = metricsData || [];

  const { data: pingMonitorsData } = useQuery({
    queryKey: ['vps', id, 'ping-monitors'],
    queryFn: async () => (await vpsApi.pingMonitors(Number(id))).data.items || [],
  });
  const pingMonitors = pingMonitorsData || [];

  const { data: pingResultsData } = useQuery({
    queryKey: ['vps', id, 'ping-results', timeRange],
    queryFn: async () => {
      if (!pingMonitors.length) return {};
      const now = Date.now();
      const since = calcSince(now);
      const results: Record<number, PingResult[]> = {};
      await Promise.all(pingMonitors.map(async (m: PingMonitor) => {
        const res = await vpsApi.pingResults(Number(id), { monitorId: m.id, limit: 20000, since });
        results[m.id] = res.data.items || [];
      }));
      return results;
    },
    enabled: pingMonitors.length > 0,
    refetchInterval: 10000,
  });
  const pingResults = pingResultsData || {};

  // --- Mutations ---
  const execMutation = useMutation({
    mutationFn: async () => vpsApi.exec(Number(id), command),
    onSuccess: (res) => setExecResult(res.data.output || '(无输出)'),
    onError: (err) => setExecResult(`错误: ${getErrorMessage(err, '执行失败')}`),
  });

  const installAgentMutation = useMutation({
    mutationFn: async (data: { authType?: string; authCredential?: string }) => 
      vpsApi.installAgent(Number(id), data),
    onSuccess: () => {
      message.success('已开始安装Agent');
      queryClient.invalidateQueries({ queryKey: ['vps', id] });
    },
    onError: (err) => message.error(getErrorMessage(err, '安装失败')),
  });

  const resetTokenMutation = useMutation({
    mutationFn: async () => vpsApi.resetToken(Number(id)),
    onSuccess: () => {
      message.success('Token已重置');
      queryClient.invalidateQueries({ queryKey: ['vps', id] });
    },
    onError: (err) => message.error(getErrorMessage(err, '重置失败')),
  });

  // --- Event Handlers ---
  const handleExec = () => {
    if (!command.trim()) return;
    execMutation.mutate();
  };

  const handleZoomChange = (isZoomed: boolean) => {
    if (isZoomed) setIsAnyChartZoomed(true);
  };

  const handleResetAllZoom = () => {
    cpuChartRef.current?.resetZoom();
    memChartRef.current?.resetZoom();
    diskIoChartRef.current?.resetZoom();
    networkChartRef.current?.resetZoom();
    loadChartRef.current?.resetZoom();
    diskUsageChartRef.current?.resetZoom();
    setIsAnyChartZoomed(false);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text || '');
    message.success('已复制');
  };

  const handleInstallAgent = () => {
    Modal.confirm({
      title: '重装Agent',
      content: '确定要重装Agent吗？这将下载最新版本并重启服务。',
      onOk: () => installAgentMutation.mutate({}), // Try direct install first
    });
  };
  
  // --- Derived Data ---
  const systemInfo = vps?.systemInfo;
  const memTotalBytes = systemInfo?.memTotal || 0;
  const memTotalGb = memTotalBytes > 0 ? memTotalBytes / (1024 * 1024 * 1024) : 0;

  const buildRateSeries = (items: Metric[], key: 'diskReadBytes' | 'diskWriteBytes' | 'netIn' | 'netOut') => {
    if (items.length < 2) return items.map((item) => [new Date(item.collectedAt).getTime(), 0]);
    return items.map((item, index) => {
      if (index === 0) return [new Date(item.collectedAt).getTime(), 0];
      const prev = items[index - 1];
      const delta = (item[key] ?? 0) - (prev[key] ?? 0);
      const t1 = new Date(prev.collectedAt).getTime();
      const t2 = new Date(item.collectedAt).getTime();
      const seconds = Math.max((t2 - t1) / 1000, 1);
      return [new Date(item.collectedAt).getTime(), Math.max(delta / seconds, 0)];
    });
  };

  const memUsedSeries = memTotalBytes
    ? metrics.map((m) => [new Date(m.collectedAt).getTime(), (memTotalBytes * (m.memUsage || 0)) / 100 / (1024*1024*1024)])
    : metrics.map((m) => [new Date(m.collectedAt).getTime(), m.memUsage || 0]);

  const memTotalSeries = memTotalBytes
      ? metrics.map((m) => [new Date(m.collectedAt).getTime(), memTotalGb])
      : undefined;

  const rootDisk = systemInfo?.disks?.[0];
  const rootDiskTotal = rootDisk?.total || 0;
  const diskFreeSeries = rootDiskTotal 
    ? metrics.map((m) => [new Date(m.collectedAt).getTime(), (rootDiskTotal * (100 - (m.diskUsage || 0))) / 100 / (1024 * 1024 * 1024)])
    : metrics.map((m) => [new Date(m.collectedAt).getTime(), 100 - (m.diskUsage || 0)]);

  const renderTime = Date.now();
  const timeRangeStart = new Date(calcSince(renderTime)).getTime();
  const timeRangeEnd = renderTime;

  if (vpsLoading) return <div className="p-8 text-center text-slate-500">加载中...</div>;
  if (!vps) return <div className="p-8 text-center text-red-500">VPS不存在</div>;

  const status = statusMap[vps.agentStatus || ''] || { text: vps.agentStatus, variant: 'secondary' };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          {vps.logo && <img src={vps.logo} alt="" className="h-8 w-auto rounded" />}
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{vps.name}</h2>
          <Badge variant={status.variant}>{status.text}</Badge>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setExecModalOpen(true)}>
            <CodeOutlined className="mr-2" /> 执行命令
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
             Modal.confirm({
                title: '重启服务器',
                content: '确定要重启服务器吗？',
                okType: 'danger',
                onOk: () => vpsApi.exec(Number(id), 'reboot').then(() => message.success('重启命令已发送')),
             });
          }}>
            <ReloadOutlined className="mr-2" /> 重启
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDDModalVisible(true)}>
            <CloudDownloadOutlined className="mr-2" /> DD重装
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/servers/${id}/edit`)}>
            <EditOutlined className="mr-2" /> 编辑
          </Button>
          <Button variant="outline" size="sm" onClick={handleInstallAgent}>
            <RobotOutlined className="mr-2" /> 重装Agent
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(val) => setSearchParams({ tab: val })}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="info">基本信息</TabsTrigger>
          <TabsTrigger value="metrics">实时监控</TabsTrigger>
          <TabsTrigger value="dd">DD重装记录</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LuInfo className="h-5 w-5" />
                    服务器信息
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 text-sm">
                    <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                      <dt className="text-slate-500">IP地址</dt>
                      <dd className="font-medium flex items-center gap-2">
                        <CountryFlag countryCode={vps.countryCode} size="sm" />
                        <span>
                          {vps.publicIpv4 || vps.ip}
                          {vps.publicIpv6 && <span className="text-slate-400">/{vps.publicIpv6}</span>}
                        </span>
                      </dd>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                      <dt className="text-slate-500">SSH端口</dt>
                      <dd className="font-medium">{vps.sshPort}</dd>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                      <dt className="text-slate-500">操作系统</dt>
                      <dd className="font-medium flex items-center gap-2">
                        <OSIcon osType={vps.osType} className="w-4 h-4" />
                        {vps.osType ? `${vps.osType} ${vps.osVersion || ''}` : '-'}
                      </dd>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                      <dt className="text-slate-500">CPU</dt>
                      <dd className="font-medium truncate" title={systemInfo?.cpuModel}>
                        {systemInfo?.cpuCores ? `${systemInfo.cpuCores}核 / ${systemInfo.cpuThreads}线程` : '-'}
                      </dd>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                      <dt className="text-slate-500">内存</dt>
                      <dd className="font-medium">
                        {systemInfo?.memTotal ? `${formatBytes(systemInfo.memTotal)}` : '-'}
                      </dd>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                      <dt className="text-slate-500">Agent Token</dt>
                      <dd className="font-mono text-xs flex items-center gap-2">
                        <span className="truncate max-w-[100px]">{vps.agentToken?.substring(0, 12)}...</span>
                        <CopyOutlined className="cursor-pointer text-slate-400 hover:text-blue-500" onClick={() => handleCopy(vps.agentToken)} />
                        <ReloadOutlined className="cursor-pointer text-slate-400 hover:text-red-500" onClick={() => resetTokenMutation.mutate()} />
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LuHardDrive className="h-5 w-5" />
                    磁盘与网络
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h4 className="text-sm font-medium mb-2 text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <LuHardDrive className="h-4 w-4" />
                      磁盘分区
                    </h4>
                    <div className="rounded-md border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500">
                          <tr>
                            <th className="p-2 font-medium">挂载点</th>
                            <th className="p-2 font-medium">类型</th>
                            <th className="p-2 font-medium">总量</th>
                            <th className="p-2 font-medium">已用</th>
                            <th className="p-2 font-medium">使用率</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {systemInfo?.disks?.map(d => (
                            <tr key={d.path}>
                              <td className="p-2">{d.path}</td>
                              <td className="p-2 text-slate-500">{d.fsType}</td>
                              <td className="p-2">{formatBytes(d.total)}</td>
                              <td className="p-2">{formatBytes(d.used)}</td>
                              <td className="p-2">{d.usedPercent?.toFixed(1)}%</td>
                            </tr>
                          ))}
                          {!systemInfo?.disks?.length && <tr><td colSpan={5} className="p-2 text-center text-slate-500">无数据</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Network Interfaces */}
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                    <h4 className="text-sm font-medium mb-2 text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <LuNetwork className="h-4 w-4" />
                      网络接口
                    </h4>
                    <div className="rounded-md border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500">
                          <tr>
                            <th className="p-2 font-medium">接口</th>
                            <th className="p-2 font-medium">IP地址</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {systemInfo?.networks?.map(n => (
                            <tr key={n.name}>
                              <td className="p-2">{n.name}</td>
                              <td className="p-2 text-slate-500">{n.addrs?.join(', ') || '-'}</td>
                            </tr>
                          ))}
                          {!systemInfo?.networks?.length && <tr><td colSpan={2} className="p-2 text-center text-slate-500">无数据</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LuTags className="h-5 w-5" />
                    标签 & 分组
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="text-xs text-slate-500 uppercase font-bold mb-2">标签</h4>
                    <div className="flex flex-wrap gap-2">
                       {vps.tags?.map(t => <Badge key={t.id} variant="secondary">{t.name}</Badge>)}
                       {!vps.tags?.length && <span className="text-sm text-slate-400">无标签</span>}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs text-slate-500 uppercase font-bold mb-2">分组</h4>
                    <div className="flex flex-wrap gap-2">
                       {vps.groups?.map(g => <Badge key={g.id} variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900">{g.name}</Badge>)}
                       {!vps.groups?.length && <span className="text-sm text-slate-400">未分组</span>}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {vps.billing && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <LuCreditCard className="h-5 w-5" />
                      费用信息
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between">
                         <dt className="text-slate-500">费用</dt>
                         <dd>{vps.billing.amount} {vps.billing.currency} / {vps.billing.billingCycle}</dd>
                      </div>
                      <div className="flex justify-between">
                         <dt className="text-slate-500">到期时间</dt>
                         <dd>{dayjs(vps.billing.expireDate).format('YYYY-MM-DD')}</dd>
                      </div>
                      <div className="flex justify-between">
                         <dt className="text-slate-500">流量</dt>
                         <dd>{typeof vps.billing.trafficGb === 'number' ? `${vps.billing.trafficGb} GB` : vps.billing.traffic}</dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="metrics" className="space-y-6">
           <div className="flex justify-end items-center gap-2 mb-4">
              {isAnyChartZoomed && (
                <Button variant="ghost" size="sm" onClick={handleResetAllZoom} className="text-blue-600">
                  <SyncOutlined className="mr-1" /> 重置缩放
                </Button>
              )}
              <select 
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-800 dark:bg-slate-950"
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
              >
                <option value="1h">1小时</option>
                <option value="6h">6小时</option>
                <option value="24h">24小时</option>
                <option value="7d">7天</option>
              </select>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <Card>
               <CardHeader className="py-4">
                 <CardTitle className="text-base flex items-center gap-2">
                   <LuCpu className="h-4 w-4" />
                   CPU使用率
                 </CardTitle>
               </CardHeader>
               <CardContent>
                  <LineChart
                    ref={cpuChartRef}
                    data={metrics.map((m) => [new Date(m.collectedAt).getTime(), m.cpuUsage || 0])}
                    suffix="%"
                    smoothing={0.2}
                    onZoomChange={handleZoomChange}
                    timeRangeStart={timeRangeStart}
                    timeRangeEnd={timeRangeEnd}
                    height={250}
                  />
               </CardContent>
             </Card>

             <Card>
               <CardHeader className="py-4">
                 <CardTitle className="text-base flex items-center gap-2">
                   <LuCircuitBoard className="h-4 w-4" />
                   内存使用
                 </CardTitle>
               </CardHeader>
               <CardContent>
                  <LineChart
                    ref={memChartRef}
                    data={memUsedSeries}
                    overlay={memTotalSeries}
                    color="#10b981"
                    overlayColor="#e5e7eb"
                    suffix={memTotalBytes ? "GB" : "%"}
                    smoothing={0.2}
                    onZoomChange={handleZoomChange}
                    timeRangeStart={timeRangeStart}
                    timeRangeEnd={timeRangeEnd}
                    height={250}
                  />
               </CardContent>
             </Card>
             
             <Card>
               <CardHeader className="py-4">
                 <CardTitle className="text-base flex items-center gap-2">
                   <LuArrowUpDown className="h-4 w-4" />
                   网络流量 (入/出)
                 </CardTitle>
               </CardHeader>
               <CardContent>
                 <LineChart
                    ref={networkChartRef}
                    data={buildRateSeries(metrics, 'netIn')}
                    color="#8b5cf6"
                    overlay={buildRateSeries(metrics, 'netOut')}
                    overlayColor="#f59e0b"
                    valueFormatter={formatBytesPerSec}
                    mainLabel="入"
                    overlayLabel="出"
                    smoothing={0.2}
                    onZoomChange={handleZoomChange}
                    timeRangeStart={timeRangeStart}
                    timeRangeEnd={timeRangeEnd}
                    height={250}
                 />
               </CardContent>
             </Card>

             <Card>
               <CardHeader className="py-4">
                 <CardTitle className="text-base flex items-center gap-2">
                   <LuHardDrive className="h-4 w-4" />
                   磁盘IO (读/写)
                 </CardTitle>
               </CardHeader>
               <CardContent>
                  <LineChart
                    ref={diskIoChartRef}
                    data={buildRateSeries(metrics, 'diskReadBytes')}
                    color="#3b82f6"
                    overlay={buildRateSeries(metrics, 'diskWriteBytes')}
                    overlayColor="#ef4444"
                    valueFormatter={formatBytesPerSec}
                    mainLabel="读"
                    overlayLabel="写"
                    smoothing={0.2}
                    onZoomChange={handleZoomChange}
                    timeRangeStart={timeRangeStart}
                    timeRangeEnd={timeRangeEnd}
                    height={250}
                  />
               </CardContent>
             </Card>

             <Card>
               <CardHeader className="py-4">
                 <CardTitle className="text-base flex items-center gap-2">
                   <LuActivity className="h-4 w-4" />
                   系统负载
                 </CardTitle>
               </CardHeader>
               <CardContent>
                  <LineChart
                    ref={loadChartRef}
                    data={metrics.map((m) => [new Date(m.collectedAt).getTime(), m.load1 || 0])}
                    extraSeries={[
                      { data: metrics.map((m) => [new Date(m.collectedAt).getTime(), m.load5 || 0]), color: '#10b981', label: '5分钟' },
                      { data: metrics.map((m) => [new Date(m.collectedAt).getTime(), m.load15 || 0]), color: '#f59e0b', label: '15分钟' },
                    ]}
                    color="#ef4444"
                    mainLabel="1分钟"
                    smoothing={0.2}
                    onZoomChange={handleZoomChange}
                    timeRangeStart={timeRangeStart}
                    timeRangeEnd={timeRangeEnd}
                    height={250}
                  />
               </CardContent>
             </Card>

             <Card>
               <CardHeader className="py-4">
                 <CardTitle className="text-base flex items-center gap-2">
                   <LuDatabase className="h-4 w-4" />
                   磁盘剩余空间
                 </CardTitle>
               </CardHeader>
               <CardContent>
                  <LineChart
                    ref={diskUsageChartRef}
                    data={diskFreeSeries}
                    color="#8b5cf6"
                    suffix={rootDiskTotal ? "GB" : "%"}
                    mainLabel="剩余"
                    smoothing={0.2}
                    onZoomChange={handleZoomChange}
                    timeRangeStart={timeRangeStart}
                    timeRangeEnd={timeRangeEnd}
                    height={250}
                  />
               </CardContent>
             </Card>
           </div>
           
           {/* Ping Monitors */}
           <Card>
             <CardHeader>
               <CardTitle className="flex items-center gap-2">
                 <LuClock className="h-5 w-5" />
                 网络延迟监控
               </CardTitle>
             </CardHeader>
             <CardContent>
               {pingMonitors.length > 0 ? (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {pingMonitors.map(monitor => {
                     const results = pingResults[monitor.id] || [];
                     const series = results.map(r => [new Date(r.collectedAt).getTime(), r.success ? r.latency || 0 : 0]);
                     return (
                        <div key={monitor.id} className="border border-slate-100 rounded-lg p-4 dark:border-slate-800">
                          <div className="flex justify-between mb-2">
                             <span className="font-medium text-sm">{monitor.name}</span>
                             <Badge variant="outline">{monitor.target}</Badge>
                          </div>
                          <LineChart
                             data={series}
                             color="#f43f5e"
                             height={150}
                             suffix="ms"
                             smoothing={0.2}
                             timeRangeStart={timeRangeStart}
                             timeRangeEnd={timeRangeEnd}
                          />
                        </div>
                     );
                   })}
                 </div>
               ) : (
                 <div className="text-center text-slate-500 py-8">暂无监控配置</div>
               )}
             </CardContent>
           </Card>
        </TabsContent>

        <TabsContent value="dd">
          <DDHistory vpsId={Number(id)} />
        </TabsContent>
      </Tabs>

      {/* Modals */}
      <Dialog open={execModalOpen} onOpenChange={setExecModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>执行命令</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
             <div className="flex gap-2">
               <Input 
                 value={command} 
                 onChange={e => setCommand(e.target.value)} 
                 placeholder="输入命令..." 
                 onKeyDown={e => e.key === 'Enter' && handleExec()}
               />
               <Button onClick={handleExec} disabled={execMutation.isPending}>执行</Button>
             </div>
             <pre className="bg-slate-950 text-slate-50 p-4 rounded-md h-[400px] overflow-auto font-mono text-xs whitespace-pre-wrap break-all">
                {execResult}
             </pre>
          </div>
        </DialogContent>
      </Dialog>

      <DDModal
        visible={ddModalVisible}
        vpsId={Number(id)}
        vpsName={vps.name}
        onClose={() => setDDModalVisible(false)}
        onSuccess={() => {
          setDDModalVisible(false);
          queryClient.invalidateQueries({ queryKey: ['vps', id] });
        }}
      />
    </div>
  );
}
