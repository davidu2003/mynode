import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Descriptions, Tag, Button, Space, Tabs, Spin, message, Modal, Input, Row, Col, Progress, Table, Select
} from 'antd';
import {
  EditOutlined, CodeOutlined, CopyOutlined, CloudDownloadOutlined, SyncOutlined, ReloadOutlined
} from '@ant-design/icons';
import { vpsApi } from '../../api';
import { getErrorMessage } from '../../utils/api-error';
import DDModal, { DDHistory } from '../../components/DDModal';
import LineChart from '../../components/LineChart';
import type { LineChartRef } from '../../components/LineChart';
import dayjs from 'dayjs';

const statusMap: Record<string, { text: string; color: string }> = {
  online: { text: '在线', color: 'success' },
  offline: { text: '离线', color: 'error' },
  pending: { text: '待安装', color: 'warning' },
  installing: { text: '安装中', color: 'processing' },
};

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

type ApiErrorData = {
  requireCredential?: boolean;
};

export default function ServerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [vps, setVPS] = useState<Vps | null>(null);
  const [execModalVisible, setExecModalVisible] = useState(false);
  const [ddModalVisible, setDDModalVisible] = useState(false);
  const [installAgentModalVisible, setInstallAgentModalVisible] = useState(false);
  const [sshAuthType, setSshAuthType] = useState<'password' | 'key'>('password');
  const [sshCredential, setSshCredential] = useState('');
  const [installingAgent, setInstallingAgent] = useState(false);
  const [command, setCommand] = useState('');
  const [execResult, setExecResult] = useState<string>('');
  const [executing, setExecuting] = useState(false);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [pingMonitors, setPingMonitors] = useState<PingMonitor[]>([]);
  const [pingResults, setPingResults] = useState<Record<number, PingResult[]>>({});
  const [timeRange, setTimeRange] = useState('6h');
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'info';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [isAnyChartZoomed, setIsAnyChartZoomed] = useState(false);

  // Chart refs for reset zoom
  const cpuChartRef = useRef<LineChartRef>(null);
  const memChartRef = useRef<LineChartRef>(null);
  const diskIoChartRef = useRef<LineChartRef>(null);
  const networkChartRef = useRef<LineChartRef>(null);
  const loadChartRef = useRef<LineChartRef>(null);
  const pingChartRefs = useRef<Map<number, LineChartRef>>(new Map());

  const handleZoomChange = (isZoomed: boolean) => {
    if (isZoomed) {
      setIsAnyChartZoomed(true);
    }
  };

  const handleResetAllZoom = () => {
    cpuChartRef.current?.resetZoom();
    memChartRef.current?.resetZoom();
    diskIoChartRef.current?.resetZoom();
    networkChartRef.current?.resetZoom();
    loadChartRef.current?.resetZoom();
    pingChartRefs.current.forEach((ref) => ref?.resetZoom());
    setIsAnyChartZoomed(false);
  };

  // 计算时间范围的起止时间戳（毫秒）
  const getTimeRange = () => {
    const now = Date.now();
    let rangeMs: number;
    switch (timeRange) {
      case '1h':
        rangeMs = 1 * 60 * 60 * 1000;
        break;
      case '3h':
        rangeMs = 3 * 60 * 60 * 1000;
        break;
      case '6h':
        rangeMs = 6 * 60 * 60 * 1000;
        break;
      case '12h':
        rangeMs = 12 * 60 * 60 * 1000;
        break;
      case '24h':
        rangeMs = 24 * 60 * 60 * 1000;
        break;
      case '7d':
        rangeMs = 7 * 24 * 60 * 60 * 1000;
        break;
      default:
        rangeMs = 6 * 60 * 60 * 1000;
    }
    return {
      timeRangeStart: now - rangeMs,
      timeRangeEnd: now,
    };
  };

  const { timeRangeStart, timeRangeEnd } = getTimeRange();

  const fetchVPS = async () => {
    try {
      const res = await vpsApi.get(Number(id));
      setVPS(res.data);
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '获取VPS详情失败'));
    } finally {
      setLoading(false);
    }
  };

  const calcSince = () => {
    const now = Date.now();
    switch (timeRange) {
      case '1h':
        return new Date(now - 1 * 60 * 60 * 1000).toISOString();
      case '3h':
        return new Date(now - 3 * 60 * 60 * 1000).toISOString();
      case '6h':
        return new Date(now - 6 * 60 * 60 * 1000).toISOString();
      case '12h':
        return new Date(now - 12 * 60 * 60 * 1000).toISOString();
      case '24h':
        return new Date(now - 24 * 60 * 60 * 1000).toISOString();
      case '7d':
        return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      default:
        return new Date(now - 6 * 60 * 60 * 1000).toISOString();
    }
  };

  const fetchMetrics = async () => {
    try {
      const since = calcSince();
      const res = await vpsApi.metrics(Number(id), { limit: 20000, since });
      setMetrics(res.data.items || []);
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '获取监控数据失败'));
    }
  };

  const fetchPingMonitors = async () => {
    try {
      const res = await vpsApi.pingMonitors(Number(id));
      setPingMonitors(res.data.items || []);
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '获取网络监控配置失败'));
    }
  };

  const fetchPingResults = async () => {
    if (!pingMonitors.length) return;
    try {
      const since = calcSince();
      const resultEntries = await Promise.all(
        pingMonitors.map(async (monitor) => {
          const res = await vpsApi.pingResults(Number(id), { monitorId: monitor.id, limit: 20000, since });
          return [monitor.id, res.data.items || []] as const;
        })
      );
      const nextResults: Record<number, PingResult[]> = {};
      for (const [monitorId, items] of resultEntries) {
        nextResults[monitorId] = items;
      }
      setPingResults(nextResults);
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '获取网络监控数据失败'));
    }
  };

  useEffect(() => {
    fetchVPS();
    fetchMetrics();
    fetchPingMonitors();
    // 定时刷新VPS状态和监控数据
    const vpsTimer = window.setInterval(fetchVPS, 10000);
    const metricsTimer = window.setInterval(fetchMetrics, 10000);
    return () => {
      window.clearInterval(vpsTimer);
      window.clearInterval(metricsTimer);
    };
  }, [id, timeRange]);

  useEffect(() => {
    fetchPingResults();
    const timer = window.setInterval(fetchPingResults, 10000);
    return () => window.clearInterval(timer);
  }, [id, pingMonitors.length, timeRange]);

  useEffect(() => {
    setActiveTab(searchParams.get('tab') || 'info');
  }, [searchParams]);

  // 危险命令检测
  const dangerousPatterns = [
    { pattern: /rm\s+(-[rf]+\s+)*\/($|\s)/, msg: '删除根目录' },
    { pattern: /rm\s+-[rf]*\s+--no-preserve-root/, msg: '删除根目录' },
    { pattern: /mkfs\./, msg: '格式化磁盘' },
    { pattern: /dd\s+if=.*of=\/dev\/[sh]d/, msg: 'DD写入磁盘' },
    { pattern: />\s*\/dev\/[sh]d/, msg: '写入磁盘设备' },
    { pattern: /:(){ :\|:& };:/, msg: 'Fork炸弹' },
    { pattern: /chmod\s+(-R\s+)?777\s+\/($|\s)/, msg: '修改根目录权限' },
    { pattern: /chown\s+(-R\s+)?.*\s+\/($|\s)/, msg: '修改根目录所有者' },
    { pattern: /shutdown|reboot|poweroff|init\s+[06]/, msg: '关机/重启' },
    { pattern: /systemctl\s+(stop|disable)\s+(sshd|ssh|networking)/, msg: '停止关键服务' },
    { pattern: /iptables\s+-F/, msg: '清空防火墙规则' },
    { pattern: /rm\s+.*\/etc/, msg: '删除系统配置' },
  ];

  const checkDangerousCommand = (cmd: string): string | null => {
    for (const { pattern, msg } of dangerousPatterns) {
      if (pattern.test(cmd)) {
        return msg;
      }
    }
    return null;
  };

  const executeCommand = async () => {
    setExecuting(true);
    setExecResult('');
    try {
      const res = await vpsApi.exec(Number(id), command);
      setExecResult(res.data.output || '(无输出)');
    } catch (err: unknown) {
      const fallback = err instanceof Error ? err.message : '执行失败';
      setExecResult(`错误: ${getErrorMessage(err, fallback)}`);
    } finally {
      setExecuting(false);
    }
  };

  const handleExec = async () => {
    if (!command.trim()) return;

    const dangerMsg = checkDangerousCommand(command);
    if (dangerMsg) {
      Modal.confirm({
        title: '危险命令警告',
        content: (
          <div>
            <p style={{ color: '#ff4d4f', fontWeight: 'bold' }}>检测到危险操作: {dangerMsg}</p>
            <p>即将执行的命令:</p>
            <pre style={{ background: '#f5f5f5', padding: 8, borderRadius: 4 }}>{command}</pre>
            <p>确定要继续执行吗？</p>
          </div>
        ),
        okText: '确认执行',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: executeCommand,
      });
    } else {
      Modal.confirm({
        title: '确认执行命令',
        content: (
          <div>
            <p>即将执行的命令:</p>
            <pre style={{ background: '#f5f5f5', padding: 8, borderRadius: 4 }}>{command}</pre>
          </div>
        ),
        okText: '执行',
        cancelText: '取消',
        onOk: executeCommand,
      });
    }
  };

  const handleResetToken = async () => {
    Modal.confirm({
      title: '重置Agent Token',
      content: '重置后需要重新安装Agent，确定继续？',
      onOk: async () => {
        try {
          const res = await vpsApi.resetToken(Number(id));
          message.success('Token已重置');
          setVPS({ ...vps, agentToken: res.data.agentToken, agentStatus: 'pending' });
        } catch (err: unknown) {
          message.error(getErrorMessage(err, '重置失败'));
        }
      },
    });
  };

  const handleInstallAgent = async () => {
    Modal.confirm({
      title: '重装Agent',
      content: (
        <div>
          <p>即将重装Agent，这将会：</p>
          <ul style={{ paddingLeft: 20 }}>
            <li>下载最新版本的Agent</li>
            <li>替换现有的Agent程序</li>
            <li>重启Agent服务</li>
          </ul>
          <p>确定要继续吗？</p>
        </div>
      ),
      okText: '确认重装',
      cancelText: '取消',
      onOk: async () => {
        // 直接尝试安装，后端会判断Agent是否在线
        try {
          const res = await vpsApi.installAgent(Number(id));
          if (res.data.method === 'websocket') {
            message.success('Agent在线，已开始自动更新');
          } else {
            message.success('已开始通过SSH安装Agent');
          }
          fetchVPS();
        } catch (err: unknown) {
          const errorData = (err as { response?: { data?: ApiErrorData } })?.response?.data;
          if (errorData?.requireCredential) {
            // 需要输入SSH凭证
            setSshAuthType('password');
            setSshCredential('');
            setInstallAgentModalVisible(true);
          } else {
            message.error(getErrorMessage(err, '安装失败'));
          }
        }
      },
    });
  };

  const handleInstallAgentWithCredential = async () => {
    if (!sshCredential.trim()) {
      message.error('请输入SSH凭证');
      return;
    }
    setInstallingAgent(true);
    try {
      await vpsApi.installAgent(Number(id), {
        authType: sshAuthType,
        authCredential: sshCredential,
      });
      message.success('已开始安装Agent');
      setInstallAgentModalVisible(false);
      setSshCredential('');
      fetchVPS();
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '安装失败'));
    } finally {
      setInstallingAgent(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('已复制');
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 50 }}><Spin size="large" /></div>;
  }

  if (!vps) {
    return <div>VPS不存在</div>;
  }

  const latestMetric = metrics.length > 0 ? metrics[metrics.length - 1] : null;
  const systemInfo = vps.systemInfo;
  const memTotalBytes = systemInfo?.memTotal || 0;
  const memTotalGb = memTotalBytes > 0 ? memTotalBytes / (1024 * 1024 * 1024) : 0;

  const buildRateSeries = (items: Metric[], key: 'diskReadBytes' | 'diskWriteBytes' | 'netIn' | 'netOut') => {
    if (items.length < 2) {
      return items.map((item) => [new Date(item.collectedAt).getTime(), 0]);
    }
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

  const buildLatencySeries = (items: PingResult[]) => {
    return items.map((item) => [
      new Date(item.collectedAt).getTime(),
      item.success ? item.latency || 0 : 0,
    ]);
  };

  const bytesToGb = (value?: number | null) => {
    if (!value || value <= 0) return 0;
    return value / (1024 * 1024 * 1024);
  };

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

  // 自适应单位的速率格式化（B/s → KB/s → MB/s → GB/s）
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

  const memUsedSeries = memTotalBytes
    ? metrics.map((m) => [
      new Date(m.collectedAt).getTime(),
      bytesToGb((memTotalBytes * (m.memUsage || 0)) / 100),
    ])
    : metrics.map((m) => [new Date(m.collectedAt).getTime(), m.memUsage || 0]);
  const memTotalSeries = memTotalBytes
    ? metrics.map((m) => [new Date(m.collectedAt).getTime(), memTotalGb])
    : undefined;
  const memSuffix = memTotalBytes ? 'GB' : '%';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          {vps.logo && (
            <img src={vps.logo} alt="" style={{ height: 32, width: 'auto', maxWidth: 48, borderRadius: 4 }} />
          )}
          <h2 style={{ margin: 0 }}>{vps.name}</h2>
          <Tag color={statusMap[vps.agentStatus]?.color}>
            {statusMap[vps.agentStatus]?.text}
          </Tag>
        </Space>
        <Space>
          <Button icon={<CodeOutlined />} onClick={() => setExecModalVisible(true)}>
            执行命令
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              Modal.confirm({
                title: '重启服务器',
                content: (
                  <div>
                    <p style={{ color: '#ff4d4f', fontWeight: 'bold' }}>警告：即将重启服务器！</p>
                    <p>这将执行 reboot 命令，服务器会立即重启。</p>
                    <p>重启期间服务器将无法访问，确定要继续吗？</p>
                  </div>
                ),
                okText: '确认重启',
                okButtonProps: { danger: true },
                cancelText: '取消',
                onOk: async () => {
                  try {
                    await vpsApi.exec(Number(id), 'reboot');
                    message.success('重启命令已发送');
                  } catch (err: unknown) {
                    message.error(getErrorMessage(err, '执行失败'));
                  }
                },
              });
            }}
          >
            重启
          </Button>
          <Button icon={<CloudDownloadOutlined />} danger onClick={() => setDDModalVisible(true)}>
            DD重装
          </Button>
          <Button icon={<EditOutlined />} onClick={() => navigate(`/servers/${id}/edit`)}>
            编辑
          </Button>
          <Button onClick={handleInstallAgent}>
            重装Agent
          </Button>
        </Space>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => {
          setActiveTab(key);
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('tab', key);
            return next;
          });
        }}
        items={[
          {
            key: 'info',
            label: '基本信息',
            children: (
              <Row gutter={16}>
                <Col span={16}>
                  <Card title="服务器信息" style={{ marginBottom: 16 }}>
                    <Descriptions column={2}>
                      <Descriptions.Item label="IP地址">{vps.ip}</Descriptions.Item>
                      <Descriptions.Item label="SSH端口">{vps.sshPort}</Descriptions.Item>
                      <Descriptions.Item label="操作系统">
                        {vps.osType ? `${vps.osType} ${vps.osVersion || ''}` : '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="内核版本">
                        {systemInfo?.kernel || '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="CPU信息">
                        {systemInfo?.cpuModel
                          ? `${systemInfo.cpuModel} (${systemInfo.cpuCores || '-'}核/${systemInfo.cpuThreads || '-'}线程)`
                          : '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="内存">
                        {systemInfo?.memTotal
                          ? `${formatBytes(systemInfo.memTotal)} / 可用 ${formatBytes(systemInfo.memAvailable)}`
                          : '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="架构">{vps.arch || '-'}</Descriptions.Item>
                      <Descriptions.Item label="厂商网址">
                        {vps.vendorUrl ? <a href={vps.vendorUrl} target="_blank">{vps.vendorUrl}</a> : '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Agent Token">
                        <Space>
                          <code>{vps.agentToken?.substring(0, 16)}...</code>
                          <Button size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(vps.agentToken)} />
                          <Button size="small" onClick={handleResetToken}>重置</Button>
                        </Space>
                      </Descriptions.Item>
                    </Descriptions>
                  </Card>
                  <Card title="磁盘分区" style={{ marginBottom: 16 }}>
                    {systemInfo?.disks?.length ? (
                      <Table
                        rowKey="path"
                        dataSource={systemInfo.disks}
                        pagination={false}
                        columns={[
                          { title: '挂载点', dataIndex: 'path' },
                          { title: '文件系统', dataIndex: 'fsType' },
                          {
                            title: '总量',
                            dataIndex: 'total',
                            render: (value: number) => formatBytes(value),
                          },
                          {
                            title: '已用',
                            dataIndex: 'used',
                            render: (value: number) => formatBytes(value),
                          },
                          {
                            title: '使用率',
                            dataIndex: 'usedPercent',
                            render: (value: number) => `${value?.toFixed(1) || 0}%`,
                          },
                        ]}
                      />
                    ) : (
                      <span style={{ color: '#999' }}>暂无数据</span>
                    )}
                  </Card>
                  <Card title="网络接口">
                    {systemInfo?.networks?.length ? (
                      <Table
                        rowKey="name"
                        dataSource={systemInfo.networks}
                        pagination={false}
                        columns={[
                          { title: '接口', dataIndex: 'name' },
                          {
                            title: 'IP地址',
                            dataIndex: 'addrs',
                            render: (value: string[]) => value?.join(', ') || '-',
                          },
                        ]}
                      />
                    ) : (
                      <span style={{ color: '#999' }}>暂无数据</span>
                    )}
                  </Card>
                  {vps.billing && (
                    <Card title="费用信息">
                      <Descriptions column={2}>
                        <Descriptions.Item label="费用">
                          {vps.billing.amount} {vps.billing.currency}
                        </Descriptions.Item>
                        <Descriptions.Item label="带宽">
                          {vps.billing.bandwidth || '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="流量">
                          {typeof vps.billing.trafficGb === 'number'
                            ? `${vps.billing.trafficGb} GB/${vps.billing.trafficCycle || 'monthly'}`
                            : vps.billing.traffic || '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="线路">
                          {vps.billing.route || '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="付款周期">{vps.billing.billingCycle}</Descriptions.Item>
                        <Descriptions.Item label="开始日期">
                          {dayjs(vps.billing.startDate).format('YYYY-MM-DD')}
                        </Descriptions.Item>
                        <Descriptions.Item label="到期日期">
                          {dayjs(vps.billing.expireDate).format('YYYY-MM-DD')}
                        </Descriptions.Item>
                        <Descriptions.Item label="自动续费">
                          {vps.billing.autoRenew ? <Tag color="green">是</Tag> : <Tag>否</Tag>}
                        </Descriptions.Item>
                      </Descriptions>
                    </Card>
                  )}
                </Col>
                <Col span={8}>
                  <Card title="标签" style={{ marginBottom: 16 }}>
                    {vps.tags?.length > 0 ? (
                      vps.tags.map((tag: VpsTag) => (
                        <Tag key={tag.id} color={tag.color}>{tag.name}</Tag>
                      ))
                    ) : (
                      <span style={{ color: '#999' }}>无标签</span>
                    )}
                  </Card>
                  <Card title="分组">
                    {vps.groups?.length ? (
                      vps.groups.map((group: VpsGroup) => (
                        <Tag key={group.id} color="blue">{group.name}</Tag>
                      ))
                    ) : (
                      <span style={{ color: '#999' }}>未分组</span>
                    )}
                  </Card>
                </Col>
              </Row>
            ),
          },
          {
            key: 'dd',
            label: 'DD重装',
            children: <DDHistory vpsId={Number(id)} />,
          },
          {
            key: 'metrics',
            label: '实时监控',
            children: (
              <div>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col xs={24} md={8}>
                    <Card title="CPU">
                      <Progress
                        percent={latestMetric?.cpuUsage ? Number(latestMetric.cpuUsage.toFixed(1)) : 0}
                        status={latestMetric ? 'active' : 'normal'}
                      />
                      <div style={{ marginTop: 8, color: '#666' }}>
                        {latestMetric?.cpuUsage ? `${latestMetric.cpuUsage.toFixed(1)}%` : '-'}
                        {systemInfo?.cpuCores
                          ? ` · ${systemInfo.cpuCores}核/${systemInfo.cpuThreads || '-'}线程`
                          : ''}
                      </div>
                    </Card>
                  </Col>
                  <Col xs={24} md={8}>
                    <Card title="内存">
                      <Progress
                        percent={latestMetric?.memUsage ? Number(latestMetric.memUsage.toFixed(1)) : 0}
                        status={latestMetric ? 'active' : 'normal'}
                      />
                      <div style={{ marginTop: 8, color: '#666' }}>
                        {systemInfo?.memTotal && latestMetric?.memUsage
                          ? `${formatBytes((systemInfo.memTotal * latestMetric.memUsage) / 100)} / ${formatBytes(systemInfo.memTotal)}`
                          : '-'}
                      </div>
                    </Card>
                  </Col>
                  <Col xs={24} md={8}>
                    <Card title="磁盘">
                      <Progress
                        percent={latestMetric?.diskUsage ? Number(latestMetric.diskUsage.toFixed(1)) : 0}
                        status={latestMetric ? 'active' : 'normal'}
                      />
                      <div style={{ marginTop: 8, color: '#666' }}>
                        {systemInfo?.disks?.length && latestMetric?.diskUsage
                          ? `${formatBytes((systemInfo.disks[0].total * latestMetric.diskUsage) / 100)} / ${formatBytes(systemInfo.disks[0].total)}`
                          : '-'}
                      </div>
                    </Card>
                  </Col>
                </Row>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ fontWeight: 500 }}>监控曲线</div>
                  <Space>
                    {isAnyChartZoomed && (
                      <Button
                        type="primary"
                        icon={<SyncOutlined />}
                        size="small"
                        onClick={handleResetAllZoom}
                      >
                        回到实时
                      </Button>
                    )}
                    <Select
                      value={timeRange}
                      onChange={setTimeRange}
                      options={[
                        { value: '1h', label: '最近1小时' },
                        { value: '3h', label: '最近3小时' },
                        { value: '6h', label: '最近6小时' },
                        { value: '12h', label: '最近12小时' },
                        { value: '24h', label: '最近24小时' },
                        { value: '7d', label: '最近7天' },
                      ]}
                      style={{ width: 140 }}
                    />
                  </Space>
                </div>
                <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                  <Col xs={24} md={12}>
                    <Card title="CPU使用率">
                      <LineChart
                        ref={cpuChartRef}
                        data={metrics.map((m) => [new Date(m.collectedAt).getTime(), m.cpuUsage || 0])}
                        suffix="%"
                        smoothing={0.2}
                        onZoomChange={handleZoomChange}
                        timeRangeStart={timeRangeStart}
                        timeRangeEnd={timeRangeEnd}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} md={12}>
                    <Card title="内存使用情况">
                      <LineChart
                        ref={memChartRef}
                        data={memUsedSeries}
                        overlay={memTotalSeries}
                        color="#52c41a"
                        overlayColor="#8c8c8c"
                        suffix={memSuffix}
                        smoothing={0.2}
                        onZoomChange={handleZoomChange}
                        timeRangeStart={timeRangeStart}
                        timeRangeEnd={timeRangeEnd}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} md={12}>
                    <Card title="磁盘IO (读/写)">
                      <LineChart
                        ref={diskIoChartRef}
                        data={buildRateSeries(metrics, 'diskReadBytes')}
                        color="#1890ff"
                        overlay={buildRateSeries(metrics, 'diskWriteBytes')}
                        overlayColor="#ff4d4f"
                        valueFormatter={formatBytesPerSec}
                        mainLabel="读"
                        overlayLabel="写"
                        smoothing={0.2}
                        onZoomChange={handleZoomChange}
                        timeRangeStart={timeRangeStart}
                        timeRangeEnd={timeRangeEnd}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} md={12}>
                    <Card title="网络流量 (入/出)">
                      <LineChart
                        ref={networkChartRef}
                        data={buildRateSeries(metrics, 'netIn')}
                        color="#722ed1"
                        overlay={buildRateSeries(metrics, 'netOut')}
                        overlayColor="#faad14"
                        valueFormatter={formatBytesPerSec}
                        mainLabel="入"
                        overlayLabel="出"
                        smoothing={0.2}
                        onZoomChange={handleZoomChange}
                        timeRangeStart={timeRangeStart}
                        timeRangeEnd={timeRangeEnd}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} md={12}>
                    <Card title="系统负载 (Load1)">
                      <LineChart
                        ref={loadChartRef}
                        data={metrics.map((m) => [new Date(m.collectedAt).getTime(), m.load1 || 0])}
                        color="#13c2c2"
                        smoothing={0.2}
                        onZoomChange={handleZoomChange}
                        timeRangeStart={timeRangeStart}
                        timeRangeEnd={timeRangeEnd}
                      />
                    </Card>
                  </Col>
                </Row>
                <Card title="网络监控">
                  {pingMonitors.length ? (
                    <Row gutter={16}>
                      {pingMonitors.map((monitor) => {
                        const items = pingResults[monitor.id] || [];
                        const latest = items.length ? items[items.length - 1] : null;
                        const latencySeries = buildLatencySeries(items);
                        const statusText = latest
                          ? (latest.success ? '正常' : '失败')
                          : '无数据';
                        const statusColor = latest
                          ? (latest.success ? '#52c41a' : '#ff4d4f')
                          : '#999';
                        return (
                          <Col xs={24} md={12} key={monitor.id} style={{ marginBottom: 16 }}>
                            <Card type="inner" title={`${monitor.name} (${monitor.type.toUpperCase()})`}>
                              <div style={{ marginBottom: 8, color: '#666' }}>
                                目标: {monitor.type === 'tcp' ? `${monitor.target}:${monitor.port}` : monitor.target}
                                {' '}· 频率: {monitor.interval}s
                                {' '}· 状态: <span style={{ color: statusColor }}>{statusText}</span>
                                {latest?.success && latest?.latency ? ` · ${latest.latency.toFixed(1)} ms` : ''}
                                {latest?.error ? ` · ${latest.error}` : ''}
                              </div>
                              <LineChart
                                data={latencySeries}
                                color="#1890ff"
                                smoothing={0.3}
                                suffix="ms"
                                timeRangeStart={timeRangeStart}
                                timeRangeEnd={timeRangeEnd}
                                onZoomChange={handleZoomChange}
                              />
                            </Card>
                          </Col>
                        );
                      })}
                    </Row>
                  ) : (
                    <span style={{ color: '#999' }}>暂无网络监控配置</span>
                  )}
                </Card>
              </div>
            ),
          },
        ]}
      />

      <Modal
        title="执行命令"
        open={execModalVisible}
        onCancel={() => setExecModalVisible(false)}
        footer={null}
        width={700}
      >
        <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
          <Input
            placeholder="输入命令..."
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onPressEnter={handleExec}
          />
          <Button type="primary" onClick={handleExec} loading={executing}>
            执行
          </Button>
        </Space.Compact>
        {execResult && (
          <pre
            style={{
              background: '#1e1e1e',
              color: '#d4d4d4',
              padding: 16,
              borderRadius: 8,
              maxHeight: 400,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {execResult}
          </pre>
        )}
      </Modal>

      <DDModal
        visible={ddModalVisible}
        vpsId={Number(id)}
        vpsName={vps.name}
        onClose={() => setDDModalVisible(false)}
        onSuccess={() => {
          setDDModalVisible(false);
          fetchVPS();
        }}
      />

      <Modal
        title="重装Agent - 输入SSH凭证"
        open={installAgentModalVisible}
        onCancel={() => setInstallAgentModalVisible(false)}
        onOk={handleInstallAgentWithCredential}
        confirmLoading={installingAgent}
        okText="开始安装"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>认证方式</div>
          <Select
            value={sshAuthType}
            onChange={setSshAuthType}
            style={{ width: '100%' }}
            options={[
              { value: 'password', label: '密码' },
              { value: 'key', label: 'SSH密钥' },
            ]}
          />
        </div>
        <div>
          <div style={{ marginBottom: 8 }}>{sshAuthType === 'password' ? 'SSH密码' : 'SSH私钥'}</div>
          {sshAuthType === 'password' ? (
            <Input.Password
              placeholder="请输入SSH密码"
              value={sshCredential}
              onChange={(e) => setSshCredential(e.target.value)}
            />
          ) : (
            <Input.TextArea
              rows={4}
              placeholder="请粘贴SSH私钥内容"
              value={sshCredential}
              onChange={(e) => setSshCredential(e.target.value)}
            />
          )}
        </div>
        <div style={{ marginTop: 12, color: '#999', fontSize: 12 }}>
          凭证仅用于本次安装，不会保存到服务器。
        </div>
      </Modal>
    </div>
  );
}
