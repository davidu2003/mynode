import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Table, Button, Tag, Space, message, Modal, Popconfirm, Radio, Input } from 'antd';
import { PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { softwareApi, vpsApi } from '../../api';
import { getErrorMessage } from '../../utils/api-error';
import dayjs from 'dayjs';
import ServerSelector from '../../components/ServerSelector';

type StatusMeta = { text: string; icon: ReactNode; color: string };

type VpsListItem = { id: number; name: string; ip: string; agentStatus?: string };

type SoftwareInstallation = {
  vpsId: number;
  vpsName?: string;
  status: string;
  version?: string;
  installedAt?: string;
};

type SoftwareItem = {
  id: number;
  name?: string;
  displayName: string;
  description?: string;
  category?: string;
  installMethod: string;
  serviceName?: string;
  configPath?: string;
  installations?: SoftwareInstallation[];
};

type SyncResult = { vpsId: number; success: boolean; error?: string; version?: string };

const statusMap: Record<string, StatusMeta> = {
  installed: { text: '已安装', icon: <CheckCircleOutlined />, color: 'success' },
  installing: { text: '安装中', icon: <ReloadOutlined spin />, color: 'processing' },
  failed: { text: '失败', icon: <CloseCircleOutlined />, color: 'error' },
  uninstalled: { text: '未安装', icon: <CloseCircleOutlined />, color: 'default' },
};

export default function SoftwareManagement() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [softwareList, setSoftwareList] = useState<SoftwareItem[]>([]);
  const [syncModalVisible, setSyncModalVisible] = useState(false);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [selectedSoftware, setSelectedSoftware] = useState<SoftwareItem | null>(null);
  const [allVps, setAllVps] = useState<VpsListItem[]>([]);
  const [selectedVpsIds, setSelectedVpsIds] = useState<number[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncAction, setSyncAction] = useState<'install' | 'uninstall'>('install');
  const [syncResults, setSyncResults] = useState<SyncResult[]>([]);
  const [serviceStatusMap, setServiceStatusMap] = useState<Record<number, Record<number, string>>>({});
  const [baseModalVisible, setBaseModalVisible] = useState(false);
  const [baseInstalling, setBaseInstalling] = useState(false);
  const [baseResults, setBaseResults] = useState<SyncResult[]>([]);
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [configContent, setConfigContent] = useState('');
  const [configSaving, setConfigSaving] = useState(false);
  const [configVpsId, setConfigVpsId] = useState<number | null>(null);

  const fetchSoftware = async () => {
    setLoading(true);
    try {
      const res = await softwareApi.list();
      setSoftwareList(res.data.items);
    } catch (err) {
      message.error('获取软件列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchVpsList = async () => {
    try {
      const res = await vpsApi.list({ pageSize: 1000 });
      setAllVps(res.data.items);
    } catch (err) {
      console.error('Failed to fetch VPS list:', err);
    }
  };

  useEffect(() => {
    fetchSoftware();
    fetchVpsList();
  }, []);

  const handleDelete = async (id: number) => {
    try {
      await softwareApi.delete(id);
      message.success('删除成功');
      fetchSoftware();
    } catch (err) {
      message.error('删除失败');
    }
  };

  const handleSync = (software: SoftwareItem) => {
    setSelectedSoftware(software);
    setSelectedVpsIds([]);
    setSyncResults([]);
    setSyncAction('install');
    setSyncModalVisible(true);
  };

  const handleSyncConfirm = async () => {
    if (!selectedSoftware) return;
    if (selectedVpsIds.length === 0) {
      message.error('请选择服务器');
      return;
    }

    setSyncing(true);
    try {
      const res = syncAction === 'install'
        ? await softwareApi.install(selectedSoftware.id, selectedVpsIds)
        : await softwareApi.uninstall(selectedSoftware.id, selectedVpsIds);
      setSyncResults(res.data.results || []);
      const successCount = res.data.results.filter((r: SyncResult) => r.success).length;
      message.success(`${syncAction === 'install' ? '安装' : '卸载'}完成，成功: ${successCount}/${res.data.affectedServers}`);
      fetchSoftware();
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '同步失败'));
    } finally {
      setSyncing(false);
    }
  };

  const handleRefreshAll = async () => {
    setLoading(true);
    try {
      const res = await softwareApi.refreshAll();
      message.success(`刷新完成，已更新 ${res.data.refreshedCount} 条记录`);
      fetchSoftware();
    } catch (err) {
      message.error('刷新失败');
    } finally {
      setLoading(false);
    }
  };

  const handleInstallBase = async () => {
    if (selectedVpsIds.length === 0) {
      message.error('请选择服务器');
      return;
    }
    setBaseInstalling(true);
    try {
      const res = await softwareApi.installBase(selectedVpsIds);
      setBaseResults(res.data.results || []);
      message.success('基础软件安装完成');
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '安装失败'));
    } finally {
      setBaseInstalling(false);
    }
  };

  const fetchServiceStatus = async (softwareId: number) => {
    if (!selectedSoftware?.serviceName) {
      return;
    }
    const onlineVps = allVps.filter((vps) => vps.agentStatus === 'online');
    const results = await Promise.all(
      onlineVps.map((vps) =>
        softwareApi.serviceStatus(softwareId, vps.id)
          .then((res) => ({ vpsId: vps.id, status: res.data.status }))
          .catch((err) => ({ vpsId: vps.id, status: err.response?.data?.error || 'unknown' }))
      )
    );
    setServiceStatusMap((prev) => ({
      ...prev,
      [softwareId]: results.reduce((acc, item) => {
        acc[item.vpsId] = item.status;
        return acc;
      }, {} as Record<number, string>),
    }));
  };

  const columns = [
    {
      title: '软件名称',
      dataIndex: 'displayName',
      key: 'displayName',
      render: (name: string, record: SoftwareItem) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          {record.description && (
            <div style={{ fontSize: 12, color: '#999' }}>{record.description}</div>
          )}
        </div>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      render: (cat: string) => cat || '-',
    },
    {
      title: '安装方式',
      dataIndex: 'installMethod',
      key: 'installMethod',
      render: (method: string) => <Tag>{method.toUpperCase()}</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: unknown, record: SoftwareItem) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/software/${record.id}`)}
          >
            编辑
          </Button>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedSoftware(record);
              setViewModalVisible(true);
              setServiceStatusMap((prev) => ({ ...prev, [record.id]: prev[record.id] || {} }));
              fetchServiceStatus(record.id);
            }}
          >
            查看
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<SyncOutlined />}
            onClick={() => handleSync(record)}
          >
            同步
          </Button>
          <Popconfirm
            title="确定删除这个软件吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={handleRefreshAll} loading={loading}>
            刷新状态
          </Button>
          <Button onClick={() => {
            setSelectedVpsIds([]);
            setBaseResults([]);
            setBaseModalVisible(true);
          }}>
            安装基础软件
          </Button>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/software/create')}>
          添加软件
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={softwareList}
        rowKey="id"
        loading={loading}
        pagination={false}
      />

      {/* 同步对话框 */}
      <Modal
        title={`同步软件：${selectedSoftware?.displayName || ''}`}
        open={syncModalVisible}
        onOk={handleSyncConfirm}
        onCancel={() => setSyncModalVisible(false)}
        confirmLoading={syncing}
        width={600}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>操作类型：</div>
          <Radio.Group
            value={syncAction}
            onChange={(e) => setSyncAction(e.target.value)}
          >
            <Radio.Button value="install">安装</Radio.Button>
            <Radio.Button value="uninstall">卸载</Radio.Button>
          </Radio.Group>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>选择目标服务器：</div>
          <ServerSelector
            servers={allVps}
            value={selectedVpsIds}
            onChange={setSelectedVpsIds}
            placeholder="选择服务器"
          />
        </div>
        {syncResults.length > 0 && (
          <Table
            dataSource={syncResults}
            rowKey="vpsId"
            pagination={false}
            size="small"
            columns={[
              {
                title: '服务器',
                dataIndex: 'vpsId',
                key: 'vpsId',
                render: (vpsId: number) => {
                  const vps = allVps.find((item) => item.id === vpsId);
                  return vps ? `${vps.name} (${vps.ip})` : `ID ${vpsId}`;
                },
              },
              {
                title: '结果',
                dataIndex: 'success',
                key: 'success',
                render: (success: boolean) => (success ? '成功' : '失败'),
              },
              {
                title: '版本',
                dataIndex: 'version',
                key: 'version',
                render: (version: string) => version || '-',
              },
              {
                title: '错误信息',
                dataIndex: 'error',
                key: 'error',
                render: (error: string) => error || '-',
              },
            ]}
          />
        )}
      </Modal>

      {/* 查看对话框 */}
      <Modal
        title={`软件详情：${selectedSoftware?.displayName || ''}`}
        open={viewModalVisible}
        onCancel={() => setViewModalVisible(false)}
        footer={null}
        width={700}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ color: '#666' }}>服务名：{selectedSoftware?.serviceName || '未配置'}</div>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => selectedSoftware && fetchServiceStatus(selectedSoftware.id)}
            disabled={!selectedSoftware?.serviceName}
          >
            刷新状态
          </Button>
        </div>
        <Table
          dataSource={selectedSoftware?.installations || []}
          rowKey="vpsId"
          pagination={false}
          size="small"
          columns={[
            {
              title: '服务器',
              dataIndex: 'vpsName',
              key: 'vpsName',
            },
            {
              title: '安装状态',
              dataIndex: 'status',
              key: 'status',
              render: (status: string) => {
                const s = statusMap[status] || statusMap.uninstalled;
                return (
                  <Tag icon={s.icon} color={s.color}>
                    {s.text}
                  </Tag>
                );
              },
            },
            {
              title: '运行状态',
              key: 'serviceStatus',
              render: (_: unknown, record: SoftwareInstallation) => {
                const status = serviceStatusMap[selectedSoftware?.id || 0]?.[record.vpsId];
                if (!selectedSoftware?.serviceName) {
                  return <Tag>未配置</Tag>;
                }
                if (!status) {
                  return <Tag>未知</Tag>;
                }
                const color = status === 'active' ? 'green' : status === 'inactive' ? 'default' : 'warning';
                return <Tag color={color}>{status}</Tag>;
              },
            },
            {
              title: '版本',
              dataIndex: 'version',
              key: 'version',
              render: (version: string) => version || '-',
            },
            {
              title: '安装时间',
              dataIndex: 'installedAt',
              key: 'installedAt',
              render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '-',
            },
            {
              title: '操作',
              key: 'action',
              render: (_: unknown, record: SoftwareInstallation) => (
                <Space>
                  <Button
                    size="small"
                    onClick={async () => {
                      if (!selectedSoftware?.serviceName) {
                        message.error('未配置服务名');
                        return;
                      }
                      try {
                        await softwareApi.serviceAction(selectedSoftware.id, record.vpsId, 'start');
                        message.success('启动成功');
                        fetchServiceStatus(selectedSoftware.id);
                      } catch (err: unknown) {
                        message.error(getErrorMessage(err, '启动失败'));
                      }
                    }}
                  >
                    启动
                  </Button>
                  <Button
                    size="small"
                    onClick={async () => {
                      if (!selectedSoftware?.serviceName) {
                        message.error('未配置服务名');
                        return;
                      }
                      try {
                        await softwareApi.serviceAction(selectedSoftware.id, record.vpsId, 'restart');
                        message.success('重启成功');
                        fetchServiceStatus(selectedSoftware.id);
                      } catch (err: unknown) {
                        message.error(getErrorMessage(err, '重启失败'));
                      }
                    }}
                  >
                    重启
                  </Button>
                  <Button
                    size="small"
                    danger
                    onClick={async () => {
                      if (!selectedSoftware?.serviceName) {
                        message.error('未配置服务名');
                        return;
                      }
                      try {
                        await softwareApi.serviceAction(selectedSoftware.id, record.vpsId, 'stop');
                        message.success('停止成功');
                        fetchServiceStatus(selectedSoftware.id);
                      } catch (err: unknown) {
                        message.error(getErrorMessage(err, '停止失败'));
                      }
                    }}
                  >
                    停止
                  </Button>
                  <Button
                    size="small"
                    onClick={async () => {
                      if (!selectedSoftware?.configPath) {
                        message.error('未配置配置文件路径');
                        return;
                      }
                      try {
                        const res = await softwareApi.getConfig(selectedSoftware.id, record.vpsId);
                        setConfigContent(res.data.content || '');
                        setConfigVpsId(record.vpsId);
                        setConfigModalVisible(true);
                      } catch (err: unknown) {
                        message.error(getErrorMessage(err, '获取配置失败'));
                      }
                    }}
                  >
                    配置修改
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Modal>

      <Modal
        title="配置修改"
        open={configModalVisible}
        onCancel={() => setConfigModalVisible(false)}
        onOk={async () => {
          if (!selectedSoftware || !configVpsId) return;
          setConfigSaving(true);
          try {
            await softwareApi.updateConfig(selectedSoftware.id, configVpsId, configContent);
            message.success('配置已保存并重启服务');
            setConfigModalVisible(false);
          } catch (err: unknown) {
            message.error(getErrorMessage(err, '保存失败'));
          } finally {
            setConfigSaving(false);
          }
        }}
        confirmLoading={configSaving}
        width={800}
      >
        <div style={{ marginBottom: 8, color: '#666' }}>
          路径：{selectedSoftware?.configPath || '-'}
        </div>
        <Input.TextArea
          rows={16}
          value={configContent}
          onChange={(e) => setConfigContent(e.target.value)}
          style={{ fontFamily: 'Monaco, Menlo, monospace', fontSize: 13 }}
        />
      </Modal>

      <Modal
        title="安装基础软件"
        open={baseModalVisible}
        onCancel={() => setBaseModalVisible(false)}
        onOk={handleInstallBase}
        confirmLoading={baseInstalling}
        width={700}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>选择目标服务器：</div>
          <ServerSelector
            servers={allVps}
            value={selectedVpsIds}
            onChange={setSelectedVpsIds}
            placeholder="选择服务器"
          />
          <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
            将安装：nftables openssh-server bash-completion vnstat ca-certificates curl wget zip unzip tar
          </div>
        </div>
        {baseResults.length > 0 && (
          <Table
            dataSource={baseResults}
            rowKey="vpsId"
            pagination={false}
            size="small"
            columns={[
              {
                title: '服务器',
                dataIndex: 'vpsId',
                key: 'vpsId',
                render: (vpsId: number) => {
                  const vps = allVps.find((item) => item.id === vpsId);
                  return vps ? `${vps.name} (${vps.ip})` : `ID ${vpsId}`;
                },
              },
              {
                title: '结果',
                dataIndex: 'success',
                key: 'success',
                render: (success: boolean) => (success ? '成功' : '失败'),
              },
              {
                title: '错误信息',
                dataIndex: 'error',
                key: 'error',
                render: (error: string) => error || '-',
              },
            ]}
          />
        )}
      </Modal>
    </div>
  );
}
