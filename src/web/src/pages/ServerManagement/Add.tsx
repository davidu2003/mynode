import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { vpsApi, systemApi } from '../../api';
import { getErrorMessage } from '../../utils/api-error';
import dayjs from 'dayjs';
import { message } from 'antd'; // Keeping AntD message for now
import { ArrowLeftOutlined, CloudUploadOutlined, LoadingOutlined } from '@ant-design/icons';

// UI Components
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Textarea } from '../../components/ui/textarea';
import { Select } from '../../components/ui/select-native';

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

type VpsFormValues = {
  name: string;
  ip: string;
  sshPort: number;
  logo: string;
  vendorUrl: string;
  groupIds: string[]; // Native select uses strings
  tagIds: string[];
  authType: 'password' | 'key';
  authCredential?: string;
  saveCredential?: boolean;
  hasBilling: boolean;
  currency: string;
  amount?: number;
  bandwidth?: string;
  trafficGb?: number;
  trafficCycle: string;
  route?: string;
  billingCycle: string;
  cycleDays?: number;
  startDate?: string;
  expireDate?: string;
  autoRenew: boolean;
};

export default function ServerAdd() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [tags, setTags] = useState<{ id: number; name: string }[]>([]);

  const { register, handleSubmit, control, setValue, watch, reset, formState: { errors } } = useForm<VpsFormValues>({
    defaultValues: {
      sshPort: 22,
      authType: 'password',
      hasBilling: true,
      currency: 'USD',
      billingCycle: 'monthly',
      autoRenew: false,
      trafficCycle: 'monthly',
      saveCredential: false,
      groupIds: [],
      tagIds: [],
    }
  });

  const hasBilling = watch('hasBilling');
  const authType = watch('authType');
  const currentBillingCycle = watch('billingCycle');

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
        const res = await vpsApi.get(Number(id));
        const vps = res.data;

        setLogoPreview(vps.logo || '');
        reset({
          name: vps.name,
          ip: vps.ip,
          sshPort: vps.sshPort,
          logo: vps.logo || '',
          vendorUrl: vps.vendorUrl || '',
          groupIds: vps.groups?.map((g: any) => String(g.id)) || (vps.groupId ? [String(vps.groupId)] : []),
          tagIds: vps.tags?.map((t: any) => String(t.id)) || [],
          hasBilling: !!vps.billing,
          currency: vps.billing?.currency || 'USD',
          amount: vps.billing?.amount,
          bandwidth: vps.billing?.bandwidth,
          trafficGb: vps.billing?.trafficGb,
          trafficCycle: vps.billing?.trafficCycle || 'monthly',
          route: vps.billing?.route,
          billingCycle: vps.billing?.billingCycle || 'monthly',
          cycleDays: vps.billing?.cycleDays,
          startDate: vps.billing?.startDate ? dayjs(vps.billing.startDate).format('YYYY-MM-DD') : '',
          expireDate: vps.billing?.expireDate ? dayjs(vps.billing.expireDate).format('YYYY-MM-DD') : '',
          autoRenew: vps.billing?.autoRenew || false,
        });
      } catch (err) {
        message.error('获取服务器信息失败');
      } finally {
        setFetching(false);
      }
    };
    fetchVps();
  }, [id, isEdit, reset]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      message.error('请上传图片文件');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      setLogoPreview(result);
      setValue('logo', result);
    };
    reader.readAsDataURL(file);
  };

  const onSubmit = async (values: VpsFormValues) => {
    setLoading(true);
    try {
      const data: any = {
        name: values.name,
        ip: values.ip,
        sshPort: Number(values.sshPort) || 22,
        logo: values.logo,
        vendorUrl: values.vendorUrl,
        groupIds: values.groupIds?.map(Number),
        tagIds: values.tagIds?.map(Number),
      };

      if (!isEdit) {
        data.authType = values.authType;
        data.authCredential = values.authCredential;
        data.saveCredential = values.saveCredential;
      }

      if (values.hasBilling) {
        data.billing = {
          currency: values.currency,
          amount: values.amount ? Number(values.amount) : undefined,
          bandwidth: values.bandwidth,
          trafficGb: values.trafficGb ? Number(values.trafficGb) : undefined,
          trafficCycle: values.trafficCycle,
          route: values.route,
          billingCycle: values.billingCycle,
          cycleDays: values.billingCycle === 'custom' ? Number(values.cycleDays) : undefined,
          startDate: values.startDate ? new Date(values.startDate).toISOString() : undefined,
          expireDate: values.expireDate ? new Date(values.expireDate).toISOString() : undefined,
          autoRenew: values.autoRenew,
        };
      }

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

  if (fetching) {
    return <div className="p-8 text-center text-slate-500"><LoadingOutlined className="mr-2" /> 加载中...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeftOutlined />
        </Button>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{isEdit ? '编辑服务器' : '添加服务器'}</h2>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>基本信息</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">名称 *</Label>
                <Input id="name" {...register('name', { required: true })} placeholder="VPS名称" className={errors.name ? 'border-red-500' : ''} />
                {errors.name && <span className="text-xs text-red-500">请输入名称</span>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="ip">IP地址 *</Label>
                <Input id="ip" {...register('ip', { required: true })} placeholder="192.168.1.1" className={errors.ip ? 'border-red-500' : ''} />
                {errors.ip && <span className="text-xs text-red-500">请输入IP地址</span>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sshPort">SSH端口</Label>
                <Input id="sshPort" type="number" {...register('sshPort')} placeholder="22" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendorUrl">厂商网址</Label>
                <Input id="vendorUrl" {...register('vendorUrl')} placeholder="https://example.com" />
              </div>
            </div>

            {!isEdit && (
              <div className="border border-slate-100 rounded-md p-4 bg-slate-50 dark:bg-slate-900 dark:border-slate-800 space-y-4">
                <div className="space-y-2">
                  <Label>认证方式</Label>
                  <Select {...register('authType')}>
                    <option value="password">密码</option>
                    <option value="key">SSH密钥</option>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>{authType === 'password' ? '密码' : 'SSH私钥'} *</Label>
                  {authType === 'password' ? (
                    <Input type="password" {...register('authCredential', { required: !isEdit })} placeholder="SSH密码" />
                  ) : (
                    <Textarea {...register('authCredential', { required: !isEdit })} placeholder="粘贴SSH私钥内容" rows={4} />
                  )}
                  {errors.authCredential && <span className="text-xs text-red-500">请输入认证凭证</span>}
                </div>

                <div className="flex items-center gap-2">
                  <Controller
                    control={control}
                    name="saveCredential"
                    render={({ field: { value, onChange } }) => (
                      <Switch checked={value} onCheckedChange={onChange} id="saveCredential" />
                    )}
                  />
                  <Label htmlFor="saveCredential" className="cursor-pointer">保存SSH凭证 (方便后续一键安装Agent)</Label>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Logo</Label>
              <div className="flex items-center gap-4">
                <div className="relative overflow-hidden inline-block">
                  <Button type="button" variant="outline" onClick={() => document.getElementById('logo-upload')?.click()}>
                    <CloudUploadOutlined className="mr-2" /> 上传图片
                  </Button>
                  <input 
                    id="logo-upload" 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleLogoUpload} 
                  />
                </div>
                {logoPreview && (
                  <img src={logoPreview} alt="Logo Preview" className="h-10 w-auto rounded object-contain border border-slate-200 p-1" />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>分组</Label>
                <Controller
                  control={control}
                  name="groupIds"
                  render={({ field: { value, onChange } }) => (
                    <div className="flex flex-wrap gap-2 min-h-[40px] p-3 border border-slate-200 rounded-md bg-white dark:bg-slate-950 dark:border-slate-800">
                      {groups.map(g => {
                        const isSelected = value?.includes(String(g.id));
                        return (
                          <div
                            key={g.id}
                            onClick={() => {
                              const newValue = isSelected
                                ? value.filter(v => v !== String(g.id))
                                : [...(value || []), String(g.id)];
                              onChange(newValue);
                            }}
                            className={`
                              cursor-pointer px-2.5 py-0.5 rounded-full text-xs font-semibold transition-colors border
                              ${isSelected 
                                ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' 
                                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700'}
                            `}
                          >
                            {g.name}
                          </div>
                        );
                      })}
                      {groups.length === 0 && <span className="text-slate-400 text-sm">无分组可选</span>}
                    </div>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>标签</Label>
                <Controller
                  control={control}
                  name="tagIds"
                  render={({ field: { value, onChange } }) => (
                    <div className="flex flex-wrap gap-2 min-h-[40px] p-3 border border-slate-200 rounded-md bg-white dark:bg-slate-950 dark:border-slate-800">
                      {tags.map(t => {
                        const isSelected = value?.includes(String(t.id));
                        return (
                          <div
                            key={t.id}
                            onClick={() => {
                              const newValue = isSelected
                                ? value.filter(v => v !== String(t.id))
                                : [...(value || []), String(t.id)];
                              onChange(newValue);
                            }}
                            className={`
                              cursor-pointer px-2.5 py-0.5 rounded-full text-xs font-semibold transition-colors border
                              ${isSelected 
                                ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' 
                                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700'}
                            `}
                          >
                            {t.name}
                          </div>
                        );
                      })}
                      {tags.length === 0 && <span className="text-slate-400 text-sm">无标签可选</span>}
                    </div>
                  )}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>费用信息</CardTitle>
            <div className="flex items-center gap-2">
              <Controller
                control={control}
                name="hasBilling"
                render={({ field: { value, onChange } }) => (
                  <Switch checked={value} onCheckedChange={onChange} id="hasBilling" />
                )}
              />
              <Label htmlFor="hasBilling">启用</Label>
            </div>
          </CardHeader>
          
          {hasBilling && (
            <CardContent className="space-y-4 animate-in slide-in-from-top-2 fade-in duration-200">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                 <div className="space-y-2 col-span-2 md:col-span-1">
                   <Label>费用</Label>
                   <div className="flex gap-2">
                      <Input type="number" step="0.01" {...register('amount')} placeholder="0.00" />
                      <Select {...register('currency')} className="w-24">
                        {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                      </Select>
                   </div>
                 </div>
                 
                 <div className="space-y-2">
                   <Label>付款周期</Label>
                   <Select {...register('billingCycle')}>
                     {billingCycles.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                   </Select>
                 </div>

                 {currentBillingCycle === 'custom' && (
                    <div className="space-y-2">
                      <Label>天数</Label>
                      <Input type="number" {...register('cycleDays')} placeholder="90" />
                    </div>
                 )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>带宽</Label>
                  <Input {...register('bandwidth')} placeholder="1Gbps" />
                </div>
                <div className="space-y-2">
                  <Label>线路</Label>
                  <Input {...register('route')} placeholder="CN2 GIA" />
                </div>
                <div className="space-y-2 col-span-2 md:col-span-2">
                   <Label>流量限制</Label>
                   <div className="flex gap-2">
                      <Input type="number" {...register('trafficGb')} placeholder="1000" className="flex-1" />
                      <div className="flex items-center px-2 text-sm text-slate-500 bg-slate-100 rounded dark:bg-slate-800">GB /</div>
                      <Select {...register('trafficCycle')} className="w-24">
                        {trafficCycles.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </Select>
                   </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="space-y-2">
                   <Label>开始日期</Label>
                   <Input type="date" {...register('startDate')} />
                 </div>
                 <div className="space-y-2">
                   <Label>到期日期</Label>
                   <Input type="date" {...register('expireDate')} />
                 </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Controller
                  control={control}
                  name="autoRenew"
                  render={({ field: { value, onChange } }) => (
                    <Switch checked={value} onCheckedChange={onChange} id="autoRenew" />
                  )}
                />
                <Label htmlFor="autoRenew" className="cursor-pointer">自动续费</Label>
              </div>
            </CardContent>
          )}
        </Card>

        <div className="flex gap-4 justify-end">
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>取消</Button>
          <Button type="submit" disabled={loading}>
            {loading ? <LoadingOutlined className="mr-2 animate-spin" /> : null}
            {isEdit ? '保存更改' : '添加服务器'}
          </Button>
        </div>
      </form>
    </div>
  );
}
