import { useState, useEffect } from 'react';
import {
  Modal, Form, Select, Input, InputNumber, Button, Steps, message, Alert, Table, Tag
} from 'antd';
import { ExclamationCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { ddApi } from '../api';
import { getErrorMessage } from '../utils/api-error';
import dayjs from 'dayjs';

interface DDModalProps {
  visible: boolean;
  vpsId: number;
  vpsName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const statusMap: Record<string, { text: string; color: string }> = {
  pending: { text: '等待中', color: 'default' },
  executing: { text: '执行DD脚本', color: 'processing' },
  rebooting: { text: '重启中', color: 'processing' },
  waiting: { text: '等待重装完成', color: 'processing' },
  reconnecting: { text: '重新连接', color: 'processing' },
  installing_agent: { text: '安装Agent', color: 'processing' },
  completed: { text: '已完成', color: 'success' },
  failed: { text: '失败', color: 'error' },
};

const statusSteps = [
  'pending',
  'executing',
  'rebooting',
  'waiting',
  'reconnecting',
  'installing_agent',
  'completed',
];

export default function DDModal({ visible, vpsId, vpsName, onClose, onSuccess }: DDModalProps) {
  type DdStartValues = {
    targetOs: string;
    targetVersion: string;
    newPassword: string;
    newSshPort: number;
  };

  type DdTaskStatus = {
    status: string;
    errorMessage?: string;
    commandOutput?: string;
  };

  type DdHistoryItem = {
    id: number;
    targetOs: string;
    targetVersion: string;
    status: string;
    startedAt?: string;
    completedAt?: string;
    errorMessage?: string;
  };

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [supportedOS, setSupportedOS] = useState<Record<string, string[]>>({});
  const [selectedOS, setSelectedOS] = useState<string>('');
  const [taskId, setTaskId] = useState<number | null>(null);
  const [taskStatus, setTaskStatus] = useState<DdTaskStatus | null>(null);
  const [polling, setPolling] = useState(false);

  // 获取支持的操作系统
  useEffect(() => {
    if (visible) {
      ddApi.getSupportedOS().then((res) => {
        setSupportedOS(res.data);
      }).catch(() => {
        message.error('获取系统列表失败');
      });
    }
  }, [visible]);

  // 轮询任务状态
  useEffect(() => {
    if (!taskId || !polling) return;

    const interval = setInterval(async () => {
      try {
        const res = await ddApi.getTaskStatus(taskId);
        setTaskStatus(res.data);

        if (res.data.status === 'completed') {
          setPolling(false);
          message.success('DD重装完成');
          onSuccess();
        } else if (res.data.status === 'failed') {
          setPolling(false);
          message.error(`DD重装失败: ${res.data.errorMessage || '未知错误'}`);
        }
      } catch (err) {
        console.error('Failed to get task status:', err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [taskId, polling]);

  const startDD = async (values: DdStartValues, force?: boolean) => {
    setLoading(true);
    try {
      const res = await ddApi.start(vpsId, {
        targetOs: values.targetOs,
        targetVersion: values.targetVersion,
        newPassword: values.newPassword,
        newSshPort: values.newSshPort,
      }, { force });

      setTaskId(res.data.taskId);
      setPolling(true);
      message.success('DD重装任务已开始');
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err, 'DD重装启动失败');
      if (!force && errorMessage.includes('已有正在进行的DD任务')) {
        Modal.confirm({
          title: '检测到正在进行的DD任务',
          icon: <ExclamationCircleOutlined />,
          content: (
            <div>
              <p>该VPS已有正在进行的DD任务。</p>
              <p style={{ color: '#ff4d4f' }}>强制执行将终止当前任务并重新开始。</p>
            </div>
          ),
          okText: '强制执行',
          okType: 'danger',
          cancelText: '取消',
          onOk: () => startDD(values, true),
        });
        return;
      }
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      Modal.confirm({
        title: '确认DD重装',
        icon: <ExclamationCircleOutlined />,
        content: (
          <div>
            <p style={{ color: '#ff4d4f', fontWeight: 'bold' }}>
              警告：DD重装将清除VPS上的所有数据！
            </p>
            <p>目标系统：{values.targetOs} {values.targetVersion}</p>
            <p>新SSH端口：{values.newSshPort}</p>
            <p>此操作不可逆，请确保已备份重要数据。</p>
          </div>
        ),
        okText: '确认重装',
        okType: 'danger',
        cancelText: '取消',
        onOk: async () => {
          await startDD(values);
        },
      });
    } catch {
      // 表单验证失败
    }
  };

  const handleClose = () => {
    if (polling) {
      Modal.confirm({
        title: '确认关闭',
        content: 'DD任务正在进行中，关闭后可在VPS详情页查看任务状态。确认关闭？',
        onOk: () => {
          setPolling(false);
          setTaskId(null);
          setTaskStatus(null);
          form.resetFields();
          onClose();
        },
      });
    } else {
      setTaskId(null);
      setTaskStatus(null);
      form.resetFields();
      onClose();
    }
  };

  const getCurrentStep = () => {
    if (!taskStatus) return 0;
    const index = statusSteps.indexOf(taskStatus.status);
    return index >= 0 ? index : 0;
  };

  return (
    <Modal
      title={`DD重装 - ${vpsName}`}
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={600}
      maskClosable={false}
    >
      {taskId ? (
        // 任务进行中，显示进度
        <div>
          <Steps
            current={getCurrentStep()}
            status={taskStatus?.status === 'failed' ? 'error' : 'process'}
            size="small"
            style={{ marginBottom: 24 }}
            items={[
              { title: '开始' },
              { title: '执行脚本' },
              { title: '重启' },
              { title: '等待重装' },
              { title: '重连' },
              { title: '安装Agent' },
              { title: '完成' },
            ]}
          />

          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Tag color={statusMap[taskStatus?.status]?.color || 'default'} style={{ fontSize: 16, padding: '4px 12px' }}>
              {statusMap[taskStatus?.status]?.text || taskStatus?.status}
            </Tag>

            {taskStatus?.status === 'waiting' && (
              <p style={{ marginTop: 16, color: '#666' }}>
                正在等待VPS重装完成，这可能需要5-15分钟...
              </p>
            )}

            {taskStatus?.status === 'failed' && taskStatus?.errorMessage && (
              <Alert
                type="error"
                message="重装失败"
                description={taskStatus.errorMessage}
                style={{ marginTop: 16, textAlign: 'left' }}
              />
            )}

            {taskStatus?.commandOutput && (
              <Alert
                type="info"
                message="执行输出"
                description={
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {taskStatus.commandOutput}
                  </pre>
                }
                style={{ marginTop: 16, textAlign: 'left' }}
              />
            )}

            {taskStatus?.status === 'completed' && (
              <Alert
                type="success"
                message="重装完成"
                description="VPS已成功重装，Agent正在重新连接中..."
                style={{ marginTop: 16, textAlign: 'left' }}
              />
            )}
          </div>

          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <Button onClick={handleClose}>
              {taskStatus?.status === 'completed' || taskStatus?.status === 'failed' ? '关闭' : '后台运行'}
            </Button>
          </div>
        </div>
      ) : (
        // 配置表单
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            newSshPort: 22,
          }}
        >
          <Alert
            type="warning"
            message="DD重装会清除VPS上的所有数据"
            description="请确保已备份重要数据。重装完成后需要用新的密码和端口连接。"
            style={{ marginBottom: 24 }}
            showIcon
          />

          <Form.Item
            name="targetOs"
            label="目标操作系统"
            rules={[{ required: true, message: '请选择操作系统' }]}
          >
            <Select
              placeholder="选择操作系统"
              onChange={(v) => {
                setSelectedOS(v);
                form.setFieldValue('targetVersion', undefined);
              }}
              options={Object.keys(supportedOS).map((os) => ({
                value: os,
                label: os.charAt(0).toUpperCase() + os.slice(1),
              }))}
            />
          </Form.Item>

          <Form.Item
            name="targetVersion"
            label="系统版本"
            rules={[{ required: true, message: '请选择系统版本' }]}
          >
            <Select
              placeholder="选择版本"
              disabled={!selectedOS}
              options={(supportedOS[selectedOS] || []).map((v) => ({
                value: v,
                label: v,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="newPassword"
            label="新root密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 8, message: '密码至少8个字符' },
            ]}
            extra="重装后使用此密码登录"
          >
            <Input.Password placeholder="设置新的root密码" />
          </Form.Item>

          <Form.Item
            name="newSshPort"
            label="新SSH端口"
            rules={[{ required: true, message: '请输入SSH端口' }]}
            extra="重装后使用此端口连接"
          >
            <InputNumber min={1} max={65535} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Button onClick={handleClose} style={{ marginRight: 8 }}>
              取消
            </Button>
            <Button type="primary" danger onClick={handleSubmit} loading={loading}>
              开始重装
            </Button>
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}

// DD历史记录组件
interface DDHistoryProps {
  vpsId: number;
}

export function DDHistory({ vpsId }: DDHistoryProps) {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<DdHistoryItem[]>([]);

  useEffect(() => {
    fetchHistory();
  }, [vpsId]);

  const fetchHistory = async () => {
    try {
      const res = await ddApi.getHistory(vpsId);
      setHistory(res.data.items);
    } catch (err) {
      console.error('Failed to fetch DD history:', err);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '目标系统',
      key: 'os',
      render: (_: unknown, record: DdHistoryItem) => `${record.targetOs} ${record.targetVersion}`,
    },
    {
      title: 'SSH端口',
      dataIndex: 'newSshPort',
      key: 'newSshPort',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={statusMap[status]?.color || 'default'}>
          {statusMap[status]?.text || status}
        </Tag>
      ),
    },
    {
      title: '开始时间',
      dataIndex: 'startedAt',
      key: 'startedAt',
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '完成时间',
      dataIndex: 'completedAt',
      key: 'completedAt',
      render: (time: string) => time ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h4 style={{ margin: 0 }}>DD重装历史</h4>
        <Button size="small" icon={<ReloadOutlined />} onClick={fetchHistory}>
          刷新
        </Button>
      </div>
      <Table
        columns={columns}
        dataSource={history}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={false}
      />
    </div>
  );
}
