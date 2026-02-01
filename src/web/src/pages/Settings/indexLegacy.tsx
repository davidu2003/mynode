import { useEffect, useState } from 'react';
import { Tabs, Card, Form, Input, InputNumber, Switch, Button, message, Space, Select, Table } from 'antd';
import { notifyApi, authApi, systemApi, vpsApi } from '../../api';
import { getErrorMessage } from '../../utils/api-error';

export default function Settings() {
  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>系统设置</h2>
      <Tabs
        items={[
          { key: 'notify', label: '通知配置', children: <NotifySettings /> },
          { key: 'system', label: '系统配置', children: <SystemSettings /> },
          { key: 'network', label: '网络监控', children: <NetworkMonitorSettings /> },
          { key: 'audit', label: '审计日志', children: <AuditLogs /> },
          { key: 'password', label: '修改密码', children: <PasswordSettings /> },
        ]}
      />
    </div>
  );
}

function NotifySettings() {
  const [emailForm] = Form.useForm();
  const [telegramForm] = Form.useForm();
  const [emailLoading, setEmailLoading] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);

  type EmailConfig = {
    enabled?: boolean;
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPass?: string;
    fromAddress?: string;
    useTls?: boolean;
  };

  type TelegramConfig = {
    enabled?: boolean;
    botToken?: string;
    chatId?: string;
  };

  const saveEmail = async (values: EmailConfig) => {
    setEmailLoading(true);
    try {
      await notifyApi.updateEmail(values);
      message.success('邮件配置保存成功');
    } catch (err) {
      message.error('保存失败');
    } finally {
      setEmailLoading(false);
    }
  };

  const saveTelegram = async (values: TelegramConfig) => {
    setTelegramLoading(true);
    try {
      await notifyApi.updateTelegram(values);
      message.success('Telegram配置保存成功');
    } catch (err) {
      message.error('保存失败');
    } finally {
      setTelegramLoading(false);
    }
  };

  const testEmail = async () => {
    setTestingEmail(true);
    try {
      await notifyApi.test('email');
      message.success('测试邮件已发送');
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '发送失败'));
    } finally {
      setTestingEmail(false);
    }
  };

  const testTelegram = async () => {
    setTestingTelegram(true);
    try {
      await notifyApi.test('telegram');
      message.success('测试消息已发送');
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '发送失败'));
    } finally {
      setTestingTelegram(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <Card title="邮件通知" style={{ flex: 1 }}>
        <Form form={emailForm} layout="vertical" onFinish={saveEmail}>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="smtpHost" label="SMTP服务器">
            <Input placeholder="如: smtp.gmail.com" />
          </Form.Item>
          <Form.Item name="smtpPort" label="SMTP端口">
            <InputNumber style={{ width: '100%' }} placeholder="465" />
          </Form.Item>
          <Form.Item name="smtpUser" label="SMTP用户名">
            <Input placeholder="邮箱账号" />
          </Form.Item>
          <Form.Item name="smtpPass" label="SMTP密码">
            <Input.Password placeholder="邮箱密码或应用密码" />
          </Form.Item>
          <Form.Item name="fromAddress" label="发件人地址">
            <Input placeholder="发件人邮箱" />
          </Form.Item>
          <Form.Item name="useTls" label="使用TLS" valuePropName="checked">
            <Switch defaultChecked />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={emailLoading}>保存</Button>
              <Button onClick={testEmail} loading={testingEmail}>发送测试</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card title="Telegram通知" style={{ flex: 1 }}>
        <Form form={telegramForm} layout="vertical" onFinish={saveTelegram}>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="botToken" label="Bot Token">
            <Input.Password placeholder="通过 @BotFather 获取" />
          </Form.Item>
          <Form.Item name="chatId" label="Chat ID">
            <Input placeholder="个人或群组的Chat ID" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={telegramLoading}>保存</Button>
              <Button onClick={testTelegram} loading={testingTelegram}>发送测试</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

function PasswordSettings() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  type PasswordFormValues = {
    oldPassword: string;
    newPassword: string;
    confirmPassword: string;
  };

  const onFinish = async (values: PasswordFormValues) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      await authApi.changePassword({
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      message.success('密码修改成功');
      form.resetFields();
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '修改失败'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card style={{ maxWidth: 400 }}>
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item
          name="oldPassword"
          label="当前密码"
          rules={[{ required: true, message: '请输入当前密码' }]}
        >
          <Input.Password />
        </Form.Item>
        <Form.Item
          name="newPassword"
          label="新密码"
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 8, message: '密码至少8个字符' },
          ]}
        >
          <Input.Password />
        </Form.Item>
        <Form.Item
          name="confirmPassword"
          label="确认新密码"
          rules={[{ required: true, message: '请确认新密码' }]}
        >
          <Input.Password />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            修改密码
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}

function SystemSettings() {
  const [form] = Form.useForm();
  const [agentForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [agentSaving, setAgentSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const [settingsRes, agentConfigRes] = await Promise.all([
          systemApi.settings(),
          systemApi.agentCheckConfig(),
        ]);
        form.setFieldsValue({
          publicBaseUrl: settingsRes.data.publicBaseUrl || '',
        });
        agentForm.setFieldsValue({
          checkInterval: agentConfigRes.data.checkInterval || 30,
          offlineThreshold: agentConfigRes.data.offlineThreshold || 90,
        });
      } catch {
        message.error('获取系统配置失败');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  type SystemFormValues = { publicBaseUrl?: string };
  type AgentCheckFormValues = { checkInterval: number; offlineThreshold: number };

  const onFinish = async (values: SystemFormValues) => {
    setSaving(true);
    try {
      await systemApi.updateSetting('publicBaseUrl', values.publicBaseUrl?.trim() || '');
      message.success('系统配置保存成功');
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const onAgentFinish = async (values: AgentCheckFormValues) => {
    const checkInterval = Number(values.checkInterval);
    const offlineThreshold = Number(values.offlineThreshold);

    if (offlineThreshold <= checkInterval) {
      message.error('离线阈值必须大于检查频率');
      return;
    }

    setAgentSaving(true);
    try {
      await systemApi.updateAgentCheckConfig({ checkInterval, offlineThreshold });
      message.success('Agent检查配置保存成功');
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '保存失败'));
    } finally {
      setAgentSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <Card title="基础配置" style={{ flex: 1, minWidth: 300 }} loading={loading}>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="publicBaseUrl"
            label="PUBLIC_BASE_URL"
            extra="用于生成Agent连接地址，例如 https://panel.example.com （包含BASE_PATH）"
          >
            <Input placeholder="https://panel.example.com" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={saving}>
              保存
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="Agent在线检查" style={{ flex: 1, minWidth: 300 }} loading={loading}>
        <Form form={agentForm} layout="vertical" onFinish={onAgentFinish}>
          <Form.Item
            name="checkInterval"
            label="检查频率（秒）"
            rules={[{ required: true, message: '请输入检查频率' }]}
            extra="每隔多少秒检查一次Agent心跳，范围 5-300"
          >
            <InputNumber min={5} max={300} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="offlineThreshold"
            label="离线阈值（秒）"
            rules={[{ required: true, message: '请输入离线阈值' }]}
            extra="超过多少秒没有心跳则判定为离线，范围 10-600，必须大于检查频率"
          >
            <InputNumber min={10} max={600} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={agentSaving}>
              保存
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

function NetworkMonitorSettings() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  type ServerItem = { id: number; name: string };
  type MonitorItem = {
    id?: string | number;
    name: string;
    type: 'icmp' | 'tcp';
    target: string;
    interval?: number;
    timeout?: number;
    enabled?: boolean;
  };
  type MonitorFormValues = { monitors?: MonitorItem[] };

  const [servers, setServers] = useState<ServerItem[]>([]);
  const [selectedServers, setSelectedServers] = useState<number[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [monitorsRes, serversRes] = await Promise.all([
          systemApi.networkMonitors(),
          vpsApi.list({ page: 1, pageSize: 200 }),
        ]);
        form.setFieldsValue({ monitors: monitorsRes.data.items || [] });
        setServers(serversRes.data.items || []);
      } catch {
        message.error('获取网络监控配置失败');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const onSave = async (values: MonitorFormValues) => {
    setSaving(true);
    try {
      const items = (values.monitors || []).map((item: MonitorItem) => ({
        id: item.id || `${Date.now()}-${Math.random()}`,
        name: item.name,
        type: item.type,
        target: item.target,
        interval: Number(item.interval || 60),
        timeout: Number(item.timeout || 5000),
        enabled: item.enabled !== false,
      }));
      await systemApi.updateNetworkMonitors(items);
      form.setFieldsValue({ monitors: items });
      message.success('网络监控配置已保存');
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const onApply = async () => {
    if (selectedServers.length === 0) {
      message.warning('请选择要应用的服务器');
      return;
    }
    setApplying(true);
    try {
      await systemApi.applyNetworkMonitors(selectedServers);
      message.success('已应用到所选服务器');
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '应用失败'));
    } finally {
      setApplying(false);
    }
  };

  return (
    <Card loading={loading}>
      <Form form={form} layout="vertical" onFinish={onSave} initialValues={{ monitors: [] }}>
        <Form.List name="monitors">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <Card
                  key={field.key}
                  type="inner"
                  title={`监控项 ${field.name + 1}`}
                  style={{ marginBottom: 12 }}
                  extra={<Button onClick={() => remove(field.name)}>删除</Button>}
                >
                  <Form.Item
                    name={[field.name, 'name']}
                    label="名称"
                    rules={[{ required: true, message: '请输入名称' }]}
                  >
                    <Input placeholder="如：四川电信" />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, 'type']}
                    label="类型"
                    rules={[{ required: true, message: '请选择类型' }]}
                  >
                    <Select
                      options={[
                        { value: 'icmp', label: 'ICMP' },
                        { value: 'tcp', label: 'TCP' },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, 'target']}
                    label="目标"
                    rules={[{ required: true, message: '请输入目标地址' }]}
                    extra="TCP格式：example.com:443；ICMP格式：example.com"
                  >
                    <Input placeholder="www.baidu.com:443" />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, 'interval']}
                    label="频率(秒)"
                    rules={[{ required: true, message: '请输入频率' }]}
                  >
                    <InputNumber min={10} max={3600} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, 'timeout']}
                    label="超时(毫秒)"
                  >
                    <InputNumber min={100} max={60000} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name={[field.name, 'enabled']} label="启用" valuePropName="checked">
                    <Switch defaultChecked />
                  </Form.Item>
                  <Form.Item name={[field.name, 'id']} hidden>
                    <Input />
                  </Form.Item>
                </Card>
              ))}
              <Form.Item>
                <Space>
                  <Button onClick={() => add({ interval: 60, timeout: 5000, enabled: true })}>
                    添加监控项
                  </Button>
                </Space>
              </Form.Item>
            </>
          )}
        </Form.List>

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={saving}>
              保存配置
            </Button>
            <Select
              mode="multiple"
              style={{ minWidth: 240 }}
              placeholder="选择要应用的服务器"
              options={servers.map((s) => ({ value: s.id, label: s.name }))}
              value={selectedServers}
              onChange={setSelectedServers}
            />
            <Button onClick={onApply} loading={applying}>
              应用到服务器
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
}

function AuditLogs() {
  const [loading, setLoading] = useState(false);
  type AuditLogItem = {
    id: number;
    createdAt: string;
    action?: string;
    targetType?: string;
    targetId?: number;
    details?: string;
  };
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);

  const fetchLogs = async (nextPage: number) => {
    setLoading(true);
    try {
      const res = await systemApi.auditLogs({ page: nextPage, pageSize });
      setLogs(res.data.items || []);
      setTotal(res.data.total || 0);
      setPage(nextPage);
    } catch {
      message.error('获取审计日志失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, []);

  return (
    <Card>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={logs}
        pagination={{
          current: page,
          pageSize,
          total,
          onChange: (nextPage) => fetchLogs(nextPage),
        }}
        columns={[
          { title: '时间', dataIndex: 'createdAt', render: (value: string) => new Date(value).toLocaleString() },
          { title: '动作', dataIndex: 'action' },
          { title: '目标', dataIndex: 'targetType' },
          { title: '目标ID', dataIndex: 'targetId' },
          {
            title: '详情',
            dataIndex: 'details',
            render: (value: string) => {
              if (!value) return '-';
              try {
                return <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(JSON.parse(value), null, 2)}</pre>;
              } catch {
                return value;
              }
            },
          },
        ]}
      />
    </Card>
  );
}
