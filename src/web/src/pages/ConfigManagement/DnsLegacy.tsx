import { useEffect, useState } from 'react';
import { Card, Form, Button, Space, message, Modal, Table, Tabs, Tag, Input } from 'antd';
import { SaveOutlined, SyncOutlined, RollbackOutlined } from '@ant-design/icons';
import { configModuleApi, vpsApi } from '../../api';
import { getErrorMessage } from '../../utils/api-error';
import ServerSelector from '../../components/ServerSelector';

type SyncResult = { vpsId: number; success: boolean; error?: string };
type VpsStatus = { vpsId: number; servers: string[]; locked: boolean };

type VpsListItem = {
  id: number;
  name: string;
  ip: string;
  agentStatus?: string;
};

function parseServers(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function toText(servers: string[]) {
  return (servers || []).join('\n');
}

function isValidServer(value: string) {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const domainRegex = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$/;
  return ipRegex.test(value) || domainRegex.test(value);
}

export default function DnsConfig() {
  const [form] = Form.useForm();
  const [detailForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncModalVisible, setSyncModalVisible] = useState(false);
  const [syncResults, setSyncResults] = useState<SyncResult[]>([]);
  const [allVps, setAllVps] = useState<VpsListItem[]>([]);
  const [selectedVpsIds, setSelectedVpsIds] = useState<number[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('global');
  const [statusLoading, setStatusLoading] = useState(false);
  const [vpsStatusMap, setVpsStatusMap] = useState<Record<number, VpsStatus>>({});
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailVpsId, setDetailVpsId] = useState<number | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await configModuleApi.get('dns');
      const servers = (res.data.content?.servers || []) as string[];
      form.setFieldsValue({ servers: toText(servers) });
      setUpdatedAt(res.data.updatedAt || null);
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '获取配置失败'));
    } finally {
      setLoading(false);
    }
  };

  const fetchVpsList = async () => {
    try {
      const res = await vpsApi.list({ pageSize: 1000 });
      setAllVps(res.data.items || []);
    } catch (err) {
      console.error('Failed to fetch VPS list:', err);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchVpsList();
  }, []);

  const refreshServerStatus = async () => {
    setStatusLoading(true);
    try {
      const onlineVps = allVps.filter((vps) => vps.agentStatus === 'online');
      const results = await Promise.all(
        onlineVps.map((vps) =>
          configModuleApi.getVps('dns', vps.id)
            .then((res) => ({ vpsId: vps.id, data: res.data }))
            .catch((err) => ({ vpsId: vps.id, error: err.response?.data?.error || '获取失败' }))
        )
      );
      const nextMap: Record<number, VpsStatus> = {};
      results.forEach((item) => {
        if ('data' in item && item.data?.content) {
          nextMap[item.vpsId] = {
            vpsId: item.vpsId,
            ...item.data.content,
          };
        }
      });
      setVpsStatusMap(nextMap);
      message.success('已刷新在线服务器状态');
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'servers') {
      refreshServerStatus();
    }
  }, [activeTab, allVps]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const servers = parseServers(values.servers || '');
      const invalid = servers.filter((value) => !isValidServer(value));
      if (invalid.length > 0) {
        message.error(`无效DNS地址: ${invalid.join(', ')}`);
        return;
      }
      setSaving(true);
      await configModuleApi.update('dns', { servers });
      message.success('保存成功');
      fetchConfig();
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleRollback = async () => {
    Modal.confirm({
      title: '确认回滚',
      content: '将回滚到上一个版本配置，是否继续？',
      onOk: async () => {
        try {
          await configModuleApi.rollback('dns');
          message.success('回滚成功');
          fetchConfig();
        } catch (err: unknown) {
          message.error(getErrorMessage(err, '回滚失败'));
        }
      },
    });
  };

  const handleSync = async () => {
    if (selectedVpsIds.length === 0) {
      message.error('请选择需要同步的服务器');
      return;
    }

    setSyncing(true);
    try {
      const res = await configModuleApi.sync('dns', selectedVpsIds);
      setSyncResults(res.data.results || []);
      message.success('同步完成');
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '同步失败'));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>DNS配置</h2>
          <div style={{ color: '#999', marginTop: 4 }}>
            {updatedAt ? `最后更新：${new Date(updatedAt).toLocaleString()}` : '尚未保存'}
          </div>
        </div>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'global',
            label: '全局配置',
            children: (
              <Card loading={loading}>
                <Form
                  form={form}
                  layout="vertical"
                  initialValues={{ servers: '' }}
                >
                  <Form.Item
                    name="servers"
                    label="DNS地址"
                    extra="每行一个DNS地址，仅支持IP或域名"
                  >
                    <Input.TextArea rows={8} placeholder="如:\n1.1.1.1\n8.8.8.8\ndns.google" />
                  </Form.Item>
                  <Form.Item style={{ marginBottom: 0 }}>
                    <Space>
                      <Button icon={<RollbackOutlined />} onClick={handleRollback}>
                        回滚上一个版本
                      </Button>
                      <Button
                        type="primary"
                        icon={<SaveOutlined />}
                        loading={saving}
                        onClick={handleSave}
                      >
                        保存
                      </Button>
                      <Button icon={<SyncOutlined />} onClick={() => setSyncModalVisible(true)}>
                        同步
                      </Button>
                    </Space>
                  </Form.Item>
                </Form>
              </Card>
            ),
          },
          {
            key: 'servers',
            label: '配置查看',
            children: (
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ color: '#666' }}>查看服务器当前DNS配置状态</div>
                  <Button icon={<SyncOutlined />} loading={statusLoading} onClick={refreshServerStatus}>
                    刷新状态
                  </Button>
                </div>
                <Table
                  rowKey="id"
                  dataSource={allVps}
                  pagination={false}
                  columns={[
                    {
                      title: '服务器',
                      dataIndex: 'name',
                      key: 'name',
                      render: (_: unknown, record: VpsListItem) => `${record.name} (${record.ip})`,
                    },
                    {
                      title: 'DNS地址',
                      key: 'servers',
                      render: (_: unknown, record: VpsListItem) => (
                        <Tag color={vpsStatusMap[record.id] ? 'blue' : 'warning'}>
                          {vpsStatusMap[record.id]?.servers?.join(', ') || '未知'}
                        </Tag>
                      ),
                    },
                    {
                      title: '锁定',
                      key: 'locked',
                      render: (_: unknown, record: VpsListItem) => (
                        <Tag color={vpsStatusMap[record.id] ? (vpsStatusMap[record.id]?.locked ? 'green' : 'default') : 'warning'}>
                          {vpsStatusMap[record.id] ? (vpsStatusMap[record.id]?.locked ? '是' : '否') : '未知'}
                        </Tag>
                      ),
                    },
                    {
                      title: '操作',
                      key: 'action',
                      render: (_: unknown, record: VpsListItem) => (
                        <Button
                          size="small"
                          disabled={record.agentStatus !== 'online'}
                          onClick={async () => {
                            try {
                              const res = await configModuleApi.getVps('dns', record.id);
                              detailForm.setFieldsValue({
                                servers: toText(res.data.content?.servers || []),
                              });
                              setDetailVpsId(record.id);
                              setDetailVisible(true);
                            } catch (err: unknown) {
                              message.error(getErrorMessage(err, '获取配置失败'));
                            }
                          }}
                        >
                          查看详情
                        </Button>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
        ]}
      />

      <Modal
        title="同步DNS配置"
        open={syncModalVisible}
        onOk={handleSync}
        onCancel={() => setSyncModalVisible(false)}
        confirmLoading={syncing}
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
            仅支持Agent在线的服务器
          </div>
        </div>

        {syncResults.length > 0 && (
          <Table
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
            dataSource={syncResults}
            rowKey="vpsId"
            pagination={false}
            size="small"
          />
        )}
      </Modal>

      <Modal
        title="服务器DNS配置详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        onOk={async () => {
          if (!detailVpsId) return;
          try {
            const values = await detailForm.validateFields();
            const servers = parseServers(values.servers || '');
            const invalid = servers.filter((value) => !isValidServer(value));
            if (invalid.length > 0) {
              message.error(`无效DNS地址: ${invalid.join(', ')}`);
              return;
            }
            setDetailSaving(true);
            const res = await configModuleApi.updateVps('dns', detailVpsId, { servers });
            if (res.data?.success) {
              message.success('同步完成');
            }
            setDetailVisible(false);
            setVpsStatusMap((prev) => ({
              ...prev,
              [detailVpsId]: { vpsId: detailVpsId, servers, locked: true },
            }));
          } catch (err: unknown) {
            message.error(getErrorMessage(err, '同步失败'));
          } finally {
            setDetailSaving(false);
          }
        }}
        okText="保存并同步"
        confirmLoading={detailSaving}
        width={700}
      >
        <Form
          form={detailForm}
          layout="vertical"
          initialValues={{ servers: '' }}
        >
          <Form.Item
            name="servers"
            label="DNS地址"
            extra="每行一个DNS地址，仅支持IP或域名"
          >
            <Input.TextArea rows={8} placeholder="如:\n1.1.1.1\n8.8.8.8\ndns.google" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
