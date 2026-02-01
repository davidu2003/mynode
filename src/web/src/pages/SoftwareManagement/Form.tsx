import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { message } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { softwareApi } from '../../api';
import { getErrorMessage } from '../../utils/api-error';

// UI Components
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Select } from '../../components/ui/select-native';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

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
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'create';
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<SoftwareFormValues>({
    defaultValues: {
      installMethod: 'script',
    }
  });

  useEffect(() => {
    if (isEdit) {
      setFetching(true);
      softwareApi.get(parseInt(id!, 10))
        .then(res => reset(res.data))
        .catch(() => message.error('获取软件信息失败'))
        .finally(() => setFetching(false));
    }
  }, [id, isEdit, reset]);

  const onSubmit = async (values: SoftwareFormValues) => {
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
    } catch (err) {
      message.error(getErrorMessage(err, isEdit ? '更新失败' : '创建失败'));
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return <div className="p-8 text-center text-slate-500">加载中...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/software')}>
          <ArrowLeftOutlined />
        </Button>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
          {isEdit ? '编辑软件' : '添加软件'}
        </h2>
      </div>

      <Card>
        <CardHeader><CardTitle>基本信息</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>软件标识 *</Label>
                <Input {...register('name', { required: true })} placeholder="唯一标识，如: nginx" disabled={isEdit} />
                {errors.name && <span className="text-xs text-red-500">请输入标识</span>}
              </div>
              <div className="space-y-2">
                <Label>显示名称 *</Label>
                <Input {...register('displayName', { required: true })} placeholder="如: Nginx Web Server" />
                {errors.displayName && <span className="text-xs text-red-500">请输入显示名称</span>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>分类</Label>
                <Input {...register('category')} placeholder="如: web" />
              </div>
              <div className="space-y-2">
                <Label>安装方式 *</Label>
                <Select {...register('installMethod', { required: true })}>
                  {installMethods.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>描述</Label>
              <Textarea {...register('description')} placeholder="简要描述..." rows={2} />
            </div>

            <div className="space-y-2">
              <Label>服务名 (systemd)</Label>
              <Input {...register('serviceName')} placeholder="如: nginx" />
              <p className="text-xs text-slate-500">用于检查运行状态及启停控制</p>
            </div>

            <div className="space-y-2">
              <Label>服务配置内容 (systemd unit)</Label>
              <Textarea 
                {...register('serviceConfigContent')} 
                placeholder="[Unit]..." 
                rows={6} 
                className="font-mono text-xs"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>配置文件路径</Label>
                <Input {...register('configPath')} placeholder="/etc/nginx/nginx.conf" />
              </div>
              <div className="space-y-2">
                <Label>检查命令</Label>
                <Input {...register('checkCommand')} placeholder="which nginx" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>默认配置内容</Label>
              <Textarea 
                {...register('configContent')} 
                placeholder="配置文件模板..." 
                rows={4} 
                className="font-mono text-xs" 
              />
            </div>

            <div className="space-y-2">
              <Label>安装脚本/命令 *</Label>
              <Textarea 
                {...register('installScript', { required: true })} 
                placeholder="apt install -y nginx" 
                rows={6} 
                className="font-mono text-xs"
              />
              {errors.installScript && <span className="text-xs text-red-500">请输入安装脚本</span>}
            </div>

            <div className="space-y-2">
              <Label>卸载脚本/命令</Label>
              <Textarea 
                {...register('uninstallScript')} 
                placeholder="apt remove -y nginx" 
                rows={3} 
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label>版本检测命令</Label>
              <Input {...register('versionCommand')} placeholder="nginx -v" />
            </div>

            <div className="flex gap-4 pt-4">
              <Button type="submit" disabled={loading}>{isEdit ? '更新' : '创建'}</Button>
              <Button type="button" variant="outline" onClick={() => navigate('/software')}>取消</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
