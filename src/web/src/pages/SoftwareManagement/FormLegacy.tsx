import { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Select, message } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { softwareApi } from '../../api';
import { getErrorMessage } from '../../utils/api-error';

const { TextArea } = Input;

const installMethods = [
  { value: 'script', label: 'Shell脚本' },
  { value: 'command', label: '单行命令' },
  { value: 'apt', label: 'APT包管理器' },
  { value: 'yum', label: 'YUM包管理器' },
];

type SoftwareFormValues = {
  name: string;
  displayName: string;
  category?: string;
  description?: string;
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

export default function SoftwareForm() {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const isEdit = !!id && id !== 'create';

  useEffect(() => {
    if (isEdit) {
      fetchSoftware();
    }
  }, [id]);

  const fetchSoftware = async () => {
    setFetching(true);
    try {
      const res = await softwareApi.get(parseInt(id!, 10));
      form.setFieldsValue(res.data);
    } catch (err) {
      message.error('获取软件信息失败');
    } finally {
      setFetching(false);
    }
  };

  const onFinish = async (values: SoftwareFormValues) => {
    setLoading(true);
    try {
      if (isEdit) {
        await softwareApi.update(parseInt(id!, 10), values);
        message.success('更新成功');
      } else {
        await softwareApi.create(values);
        message.success('创建成功');
      }
      navigate('/software');
    } catch (err: unknown) {
      message.error(getErrorMessage(err, isEdit ? '更新失败' : '创建失败'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <h2 style={{ marginBottom: 24 }}>{isEdit ? '编辑软件' : '添加软件'}</h2>
      <Card loading={fetching}>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            installMethod: 'script',
          }}
        >
          <Form.Item
            name="name"
            label="软件标识"
            rules={[{ required: true, message: '请输入软件标识' }]}
            extra="唯一标识，如: nginx, docker"
          >
            <Input placeholder="软件标识（小写字母）" disabled={isEdit} />
          </Form.Item>

          <Form.Item
            name="displayName"
            label="显示名称"
            rules={[{ required: true, message: '请输入显示名称' }]}
          >
            <Input placeholder="如: Nginx Web服务器" />
          </Form.Item>

          <Form.Item name="category" label="分类">
            <Input placeholder="如: web, container, proxy" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <TextArea rows={2} placeholder="软件描述（可选）" />
          </Form.Item>

          <Form.Item
            name="serviceName"
            label="服务名"
            extra="systemd服务名，用于运行状态检查与启动/停止/重启"
          >
            <Input placeholder="如: nginx" />
          </Form.Item>

          <Form.Item
            name="serviceConfigContent"
            label="服务配置内容"
            extra="systemd服务配置内容（可选），同步时会写入 /etc/systemd/system/<服务名>.service"
          >
            <TextArea
              rows={8}
              placeholder="[Unit]\nDescription=Your Service\nAfter=network.target\n\n[Service]\nExecStart=/path/to/bin\nRestart=always\n\n[Install]\nWantedBy=multi-user.target"
              style={{ fontFamily: 'Monaco, Menlo, monospace', fontSize: 13 }}
            />
          </Form.Item>

          <Form.Item
            name="configPath"
            label="配置文件路径"
            extra="用于配置修改功能，如: /etc/nginx/nginx.conf"
          >
            <Input placeholder="如: /etc/nginx/nginx.conf" />
          </Form.Item>

          <Form.Item
            name="configContent"
            label="默认配置内容"
            extra="可选，作为新建软件时的配置内容"
          >
            <TextArea
              rows={6}
              placeholder="配置内容（可选）"
              style={{ fontFamily: 'Monaco, Menlo, monospace', fontSize: 13 }}
            />
          </Form.Item>

          <Form.Item
            name="installMethod"
            label="安装方式"
            rules={[{ required: true, message: '请选择安装方式' }]}
          >
            <Select options={installMethods} />
          </Form.Item>

          <Form.Item
            name="installScript"
            label="安装脚本/命令"
            rules={[{ required: true, message: '请输入安装脚本' }]}
            extra="可以是多行shell脚本或单行命令"
          >
            <TextArea
              rows={8}
              placeholder="如: apt update && apt install -y nginx"
              style={{ fontFamily: 'Monaco, Menlo, monospace', fontSize: 13 }}
            />
          </Form.Item>

          <Form.Item
            name="uninstallScript"
            label="卸载脚本/命令"
            extra="可选，用于卸载软件"
          >
            <TextArea
              rows={4}
              placeholder="如: apt remove -y nginx"
              style={{ fontFamily: 'Monaco, Menlo, monospace', fontSize: 13 }}
            />
          </Form.Item>

          <Form.Item
            name="checkCommand"
            label="检查命令"
            extra="用于检查软件是否已安装，如: which nginx"
          >
            <Input placeholder="如: which nginx" />
          </Form.Item>

          <Form.Item
            name="versionCommand"
            label="版本检测命令"
            extra="用于获取已安装软件的版本号，如: nginx -v"
          >
            <Input placeholder="如: nginx -v" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} style={{ marginRight: 8 }}>
              {isEdit ? '更新' : '创建'}
            </Button>
            <Button onClick={() => navigate('/software')}>
              取消
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
