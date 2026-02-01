import { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Select, InputNumber, Switch, DatePicker, message, Space, Spin, Upload } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { vpsApi, systemApi } from '../../api';
import { getErrorMessage } from '../../utils/api-error';
import dayjs from 'dayjs';
import type { UploadProps } from 'antd';

const billingCycles = [
  { value: 'monthly', label: '月付' },
  { value: 'quarterly', label: '季付' },
  { value: 'semi-annually', label: '半年付' },
  { value: 'annually', label: '年付' },
  { value: 'biennially', label: '两年付' },
  { value: 'triennially', label: '三年付' },
  { value: 'custom', label: '自定义天数' },
];

const currencies = ['USD', 'CNY', 'EUR', 'GBP', 'JPY', 'HKD', 'TWD'];
const trafficCycles = [
  { value: 'monthly', label: '月' },
  { value: 'quarterly', label: '季' },
  { value: 'yearly', label: '年' },
];

type VpsGroup = { id: number; name: string };
type VpsTag = { id: number; name: string; color: string };

type VpsBilling = {
  billingCycle?: string;
  currency?: string;
  amount?: number;
  bandwidth?: string;
  trafficGb?: number;
  trafficCycle?: string;
  route?: string;
  cycleDays?: number;
  startDate?: string;
  expireDate?: string;
  autoRenew?: boolean;
};

type VpsDetail = {
  name: string;
  ip: string;
  sshPort?: number;
  logo?: string;
  vendorUrl?: string;
  groupId?: number;
  groups?: VpsGroup[];
  tags?: VpsTag[];
  billing?: VpsBilling;
};

type VpsFormValues = {
  name: string;
  ip: string;
  sshPort?: number;
  logo?: string;
  vendorUrl?: string;
  groupIds?: number[];
  tagIds?: number[];
  authType?: 'password' | 'key';
  authCredential?: string;
  saveCredential?: boolean;
  hasBilling?: boolean;
  currency?: string;
  amount?: number;
  bandwidth?: string;
  trafficGb?: number;
  trafficCycle?: string;
  route?: string;
  billingCycle?: string;
  cycleDays?: number;
  startDate?: dayjs.Dayjs;
  expireDate?: dayjs.Dayjs;
  autoRenew?: boolean;
};

export default function ServerAdd() {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [groups, setGroups] = useState<VpsGroup[]>([]);
  const [tags, setTags] = useState<VpsTag[]>([]);
  const [billingCycle, setBillingCycle] = useState('monthly');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [groupsRes, tagsRes] = await Promise.all([
          systemApi.groups(),
          systemApi.tags(),
        ]);
        setGroups(groupsRes.data.items);
        setTags(tagsRes.data.items);
      } catch (err) {
        console.error('Failed to fetch data:', err);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    const fetchVps = async () => {
      setFetching(true);
      try {
        const vpsRes = await vpsApi.get(Number(id));
        const vps = vpsRes.data as VpsDetail;

        setBillingCycle(vps.billing?.billingCycle || 'monthly');
        setLogoPreview(vps.logo || '');
        form.setFieldsValue({
          name: vps.name,
          ip: vps.ip,
          sshPort: vps.sshPort,
          logo: vps.logo || '',
          vendorUrl: vps.vendorUrl || '',
          groupIds: vps.groups?.map((group: VpsGroup) => group.id) || (vps.groupId ? [vps.groupId] : []),
          tagIds: vps.tags?.map((tag: VpsTag) => tag.id) || [],
          hasBilling: !!vps.billing,
          currency: vps.billing?.currency || 'USD',
          amount: vps.billing?.amount,
          bandwidth: vps.billing?.bandwidth,
          trafficGb: vps.billing?.trafficGb,
          trafficCycle: vps.billing?.trafficCycle || 'monthly',
          route: vps.billing?.route,
          billingCycle: vps.billing?.billingCycle || 'monthly',
          cycleDays: vps.billing?.cycleDays,
          startDate: vps.billing?.startDate ? dayjs(vps.billing.startDate) : undefined,
          expireDate: vps.billing?.expireDate ? dayjs(vps.billing.expireDate) : undefined,
          autoRenew: vps.billing?.autoRenew || false,
        });
      } catch (err) {
        message.error('获取服务器信息失败');
      } finally {
        setFetching(false);
      }
    };
    fetchVps();
  }, [id, isEdit]);

  const handleLogoUpload: UploadProps['beforeUpload'] = (file) => {
    if (!file.type.startsWith('image/')) {
      message.error('请上传图片文件');
      return false;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      setLogoPreview(result);
      form.setFieldValue('logo', result);
    };
    reader.readAsDataURL(file);
    return false;
  };

  const onFinish = async (values: VpsFormValues) => {
    setLoading(true);
    try {
      const data: {
        name: string;
        ip: string;
        sshPort: number;
        logo?: string;
        vendorUrl?: string;
        groupIds?: number[];
        tagIds?: number[];
        authType?: 'password' | 'key';
        authCredential?: string;
        saveCredential?: boolean;
        billing?: {
          currency?: string;
          amount?: number;
          bandwidth?: string;
          trafficGb?: number;
          trafficCycle?: string;
          route?: string;
          billingCycle?: string;
          cycleDays?: number;
          startDate?: string;
          expireDate?: string;
          autoRenew?: boolean;
        };
      } = {
        name: values.name,
        ip: values.ip,
        sshPort: values.sshPort || 22,
        logo: values.logo,
        vendorUrl: values.vendorUrl,
        groupIds: values.groupIds,
        tagIds: values.tagIds,
      };

      // 新建时才传入SSH凭证信息
      if (!isEdit) {
        data.authType = values.authType;
        data.authCredential = values.authCredential;
        data.saveCredential = values.saveCredential || false;
      }

      data.billing = values.hasBilling ? {
          currency: values.currency || 'USD',
          amount: values.amount,
          bandwidth: values.bandwidth,
          trafficGb: values.trafficGb,
          trafficCycle: values.trafficCycle,
          route: values.route,
          billingCycle: values.billingCycle,
          cycleDays: values.billingCycle === 'custom' ? values.cycleDays : undefined,
          startDate: values.startDate?.toISOString(),
          expireDate: values.expireDate?.toISOString(),
          autoRenew: values.autoRenew || false,
        } : undefined;

      if (isEdit) {
        await vpsApi.update(Number(id), data);
        message.success('服务器更新成功');
        navigate(`/servers/${id}`);
      } else {
        const res = await vpsApi.create(data);
        message.success('服务器添加成功');
        navigate(`/servers/${res.data.id}`);
      }
    } catch (err: unknown) {
      message.error(getErrorMessage(err, isEdit ? '更新失败' : '添加失败'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <h2 style={{ marginBottom: 24 }}>{isEdit ? '编辑VPS' : '添加VPS'}</h2>
      {fetching && (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <Spin />
        </div>
      )}
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          sshPort: 22,
          authType: 'password',
          hasBilling: true,
          currency: 'USD',
          billingCycle: 'monthly',
          autoRenew: false,
          trafficCycle: 'monthly',
          saveCredential: false,
        }}
      >
        <Card title="基本信息" style={{ marginBottom: 16 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="VPS名称" />
          </Form.Item>
          <Form.Item name="ip" label="IP地址" rules={[{ required: true, message: '请输入IP地址' }]}>
            <Input placeholder="如: 192.168.1.1" />
          </Form.Item>
          <Form.Item name="sshPort" label="SSH端口">
            <InputNumber min={1} max={65535} style={{ width: '100%' }} />
          </Form.Item>
          {!isEdit && (
            <>
              <Form.Item name="authType" label="认证方式" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'password', label: '密码' },
                    { value: 'key', label: 'SSH密钥' },
                  ]}
                />
              </Form.Item>
              <Form.Item
                noStyle
                shouldUpdate={(prev, curr) => prev.authType !== curr.authType}
              >
                {({ getFieldValue }) => (
                  <Form.Item
                    name="authCredential"
                    label={getFieldValue('authType') === 'password' ? '密码' : 'SSH私钥'}
                    rules={[{ required: true, message: '请输入认证凭证' }]}
                  >
                    {getFieldValue('authType') === 'password' ? (
                      <Input.Password placeholder="SSH密码" />
                    ) : (
                      <Input.TextArea rows={4} placeholder="粘贴SSH私钥内容" />
                    )}
                  </Form.Item>
                )}
              </Form.Item>
              <Form.Item name="saveCredential" valuePropName="checked">
                <Switch checkedChildren="保存SSH凭证" unCheckedChildren="不保存SSH凭证" />
              </Form.Item>
            </>
          )}
          <Form.Item label="Logo">
            <Space>
              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={handleLogoUpload}
              >
                <Button>上传图片</Button>
              </Upload>
              {logoPreview && (
                <img
                  src={logoPreview}
                  alt=""
                  style={{ height: 48, width: 'auto', maxWidth: 72, borderRadius: 8, objectFit: 'contain' }}
                />
              )}
            </Space>
            <Form.Item name="logo" hidden>
              <Input />
            </Form.Item>
          </Form.Item>
          <Form.Item name="vendorUrl" label="厂商网址">
            <Input placeholder="如: https://example.com" />
          </Form.Item>
          <Form.Item name="groupIds" label="分组">
            <Select
              mode="multiple"
              allowClear
              placeholder="选择分组"
              options={groups.map(g => ({ value: g.id, label: g.name }))}
            />
          </Form.Item>
          <Form.Item name="tagIds" label="标签">
            <Select
              mode="multiple"
              allowClear
              placeholder="选择标签"
              options={tags.map(t => ({ value: t.id, label: t.name }))}
            />
          </Form.Item>
        </Card>

        <Card title="费用信息" style={{ marginBottom: 16 }}>
          <Form.Item name="hasBilling" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="不记录费用" />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.hasBilling !== curr.hasBilling}>
            {({ getFieldValue }) =>
              getFieldValue('hasBilling') && (
                <>
                  <Space style={{ display: 'flex', marginBottom: 16 }}>
                    <Form.Item
                      name="amount"
                      label="费用"
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber min={0} step={0.01} style={{ width: 120 }} />
                    </Form.Item>
                    <Form.Item name="currency" label="货币" style={{ marginBottom: 0 }}>
                      <Select style={{ width: 80 }} options={currencies.map(c => ({ value: c, label: c }))} />
                    </Form.Item>
                  </Space>
                  <Space style={{ display: 'flex', marginBottom: 16 }}>
                    <Form.Item name="bandwidth" label="带宽" style={{ marginBottom: 0 }}>
                      <Input placeholder="如: 1Gbps" />
                    </Form.Item>
                    <Form.Item name="trafficGb" label="流量(GB)" style={{ marginBottom: 0 }}>
                      <InputNumber min={0} style={{ width: 140 }} />
                    </Form.Item>
                    <Form.Item name="trafficCycle" label="周期" style={{ marginBottom: 0 }}>
                      <Select style={{ width: 90 }} options={trafficCycles} />
                    </Form.Item>
                    <Form.Item name="route" label="线路" style={{ marginBottom: 0 }}>
                      <Input placeholder="如: CN2 GIA" />
                    </Form.Item>
                  </Space>
                  <Form.Item name="billingCycle" label="付款周期">
                    <Select options={billingCycles} onChange={(v) => setBillingCycle(v)} />
                  </Form.Item>
                  {billingCycle === 'custom' && (
                    <Form.Item name="cycleDays" label="自定义天数">
                      <InputNumber min={1} style={{ width: '100%' }} placeholder="如: 90" />
                    </Form.Item>
                  )}
                  <Space style={{ display: 'flex' }}>
                    <Form.Item name="startDate" label="开始日期">
                      <DatePicker />
                    </Form.Item>
                    <Form.Item name="expireDate" label="到期日期">
                      <DatePicker />
                    </Form.Item>
                  </Space>
                  <Form.Item name="autoRenew" label="自动续费" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </>
              )
            }
          </Form.Item>
        </Card>

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={loading}>
              {isEdit ? '更新VPS' : '添加VPS'}
            </Button>
            <Button onClick={() => navigate(isEdit ? `/servers/${id}` : '/servers')}>取消</Button>
          </Space>
        </Form.Item>
      </Form>
    </div>
  );
}
