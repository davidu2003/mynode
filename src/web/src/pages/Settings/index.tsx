import { useState, useEffect } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { message } from 'antd'; // Using AntD message for consistency
import { notifyApi, authApi, systemApi, vpsApi } from '../../api';
import { getErrorMessage } from '../../utils/api-error';

// UI Components
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Select } from '../../components/ui/select-native';
import { Badge } from '../../components/ui/badge';
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { LuMail, LuSend, LuSettings, LuActivity, LuNetwork, LuFileText, LuLock } from "react-icons/lu";

export default function Settings() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">系统设置</h2>
      <Tabs defaultValue="notify" className="space-y-4">
        <TabsList>
          <TabsTrigger value="notify">通知配置</TabsTrigger>
          <TabsTrigger value="system">系统配置</TabsTrigger>
          <TabsTrigger value="network">网络监控</TabsTrigger>
          <TabsTrigger value="audit">审计日志</TabsTrigger>
          <TabsTrigger value="password">修改密码</TabsTrigger>
        </TabsList>
        
        <TabsContent value="notify" className="space-y-4">
          <NotifySettings />
        </TabsContent>
        <TabsContent value="system" className="space-y-4">
          <SystemSettings />
        </TabsContent>
        <TabsContent value="network" className="space-y-4">
          <NetworkMonitorSettings />
        </TabsContent>
        <TabsContent value="audit" className="space-y-4">
          <AuditLogs />
        </TabsContent>
        <TabsContent value="password" className="space-y-4">
          <PasswordSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NotifySettings() {
  const [emailLoading, setEmailLoading] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(false);
  
  // Email Form
  const { register: regEmail, handleSubmit: subEmail, control: ctlEmail, reset: resetEmail } = useForm();
  
  // Telegram Form
  const { register: regTg, handleSubmit: subTg, control: ctlTg, reset: resetTg } = useForm();

  useEffect(() => {
    notifyApi.getConfig().then(res => {
      resetEmail(res.data.email || {});
      resetTg(res.data.telegram || {});
    });
  }, [resetEmail, resetTg]);

  const onSaveEmail = async (data: unknown) => {
    setEmailLoading(true);
    try {
      await notifyApi.updateEmail(data as any);
      message.success('邮件配置已保存');
    } catch {
      message.error('保存失败');
    } finally {
      setEmailLoading(false);
    }
  };

  const onSaveTg = async (data: unknown) => {
    setTelegramLoading(true);
    try {
      await notifyApi.updateTelegram(data as any);
      message.success('Telegram配置已保存');
    } catch {
      message.error('保存失败');
    } finally {
      setTelegramLoading(false);
    }
  };

  const testEmail = async () => {
    try {
      await notifyApi.test('email');
      message.success('测试邮件已发送');
    } catch {
      message.error('发送失败');
    }
  };

  const testTg = async () => {
    try {
      await notifyApi.test('telegram');
      message.success('测试消息已发送');
    } catch {
      message.error('发送失败');
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LuMail className="h-5 w-5" />
            邮件通知
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={subEmail(onSaveEmail)} className="space-y-4">
            <div className="flex items-center space-x-2">
              <Controller
                control={ctlEmail}
                name="enabled"
                render={({ field: { value, onChange } }) => (
                  <Switch checked={value} onCheckedChange={onChange} id="email-enabled" />
                )}
              />
              <Label htmlFor="email-enabled">启用</Label>
            </div>
            <div className="space-y-2">
              <Label>SMTP服务器</Label>
              <Input {...regEmail('smtpHost')} placeholder="smtp.example.com" />
            </div>
            <div className="space-y-2">
              <Label>SMTP端口</Label>
              <Input type="number" {...regEmail('smtpPort')} placeholder="465" />
            </div>
            <div className="space-y-2">
              <Label>用户名</Label>
              <Input {...regEmail('smtpUser')} placeholder="user@example.com" />
            </div>
            <div className="space-y-2">
              <Label>密码</Label>
              <Input type="password" {...regEmail('smtpPass')} placeholder="password" />
            </div>
            <div className="space-y-2">
              <Label>发件人地址</Label>
              <Input {...regEmail('fromAddress')} placeholder="noreply@example.com" />
            </div>
            <div className="flex items-center space-x-2">
              <Controller
                control={ctlEmail}
                name="useTls"
                render={({ field: { value, onChange } }) => (
                  <Switch checked={value} onCheckedChange={onChange} id="email-tls" />
                )}
              />
              <Label htmlFor="email-tls">使用TLS</Label>
            </div>
            <div className="flex space-x-2 pt-2">
              <Button type="submit" disabled={emailLoading}>保存</Button>
              <Button type="button" variant="outline" onClick={testEmail}>发送测试</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LuSend className="h-5 w-5" />
            Telegram通知
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={subTg(onSaveTg)} className="space-y-4">
            <div className="flex items-center space-x-2">
              <Controller
                control={ctlTg}
                name="enabled"
                render={({ field: { value, onChange } }) => (
                  <Switch checked={value} onCheckedChange={onChange} id="tg-enabled" />
                )}
              />
              <Label htmlFor="tg-enabled">启用</Label>
            </div>
            <div className="space-y-2">
              <Label>Bot Token</Label>
              <Input type="password" {...regTg('botToken')} placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" />
            </div>
            <div className="space-y-2">
              <Label>Chat ID</Label>
              <Input {...regTg('chatId')} placeholder="123456789" />
            </div>
            <div className="flex space-x-2 pt-2">
              <Button type="submit" disabled={telegramLoading}>保存</Button>
              <Button type="button" variant="outline" onClick={testTg}>发送测试</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function SystemSettings() {
  const [loading, setLoading] = useState(false);
  const { register: regSys, handleSubmit: subSys, reset: resetSys } = useForm();
  const { register: regAgent, handleSubmit: subAgent, reset: resetAgent } = useForm();

  useEffect(() => {
    Promise.all([systemApi.settings(), systemApi.agentCheckConfig()]).then(([sys, agent]) => {
      resetSys(sys.data);
      resetAgent(agent.data);
    });
  }, [resetSys, resetAgent]);

  const onSaveSys = async (data: any) => {
    setLoading(true);
    try {
      await systemApi.updateSetting('publicBaseUrl', data.publicBaseUrl);
      message.success('系统配置已保存');
    } catch {
      message.error('保存失败');
    } finally {
      setLoading(false);
    }
  };

  const onSaveAgent = async (data: any) => {
    setLoading(true);
    try {
      await systemApi.updateAgentCheckConfig({
        checkInterval: Number(data.checkInterval),
        offlineThreshold: Number(data.offlineThreshold)
      });
      message.success('Agent配置已保存');
    } catch {
      message.error('保存失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LuSettings className="h-5 w-5" />
            基础配置
          </CardTitle>
          <CardDescription>系统全局参数设置</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={subSys(onSaveSys)} className="space-y-4">
            <div className="space-y-2">
              <Label>Public Base URL</Label>
              <Input {...regSys('publicBaseUrl')} placeholder="https://panel.example.com" />
              <p className="text-[0.8rem] text-slate-500">用于生成Agent连接指令</p>
            </div>
            <Button type="submit" disabled={loading}>保存</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LuActivity className="h-5 w-5" />
            Agent在线检查
          </CardTitle>
          <CardDescription>心跳检测与离线判定</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={subAgent(onSaveAgent)} className="space-y-4">
            <div className="space-y-2">
              <Label>检查频率 (秒)</Label>
              <Input type="number" {...regAgent('checkInterval')} />
            </div>
            <div className="space-y-2">
              <Label>离线阈值 (秒)</Label>
              <Input type="number" {...regAgent('offlineThreshold')} />
            </div>
            <Button type="submit" disabled={loading}>保存</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function PasswordSettings() {
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, reset } = useForm();

  const onSubmit = async (data: any) => {
    if (data.newPassword !== data.confirmPassword) {
      message.error('两次密码输入不一致');
      return;
    }
    setLoading(true);
    try {
      await authApi.changePassword(data);
      message.success('密码修改成功');
      reset();
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '修改失败'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuLock className="h-5 w-5" />
          修改密码
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>当前密码</Label>
            <Input type="password" {...register('oldPassword', { required: true })} />
          </div>
          <div className="space-y-2">
            <Label>新密码</Label>
            <Input type="password" {...register('newPassword', { required: true, minLength: 8 })} />
          </div>
          <div className="space-y-2">
            <Label>确认新密码</Label>
            <Input type="password" {...register('confirmPassword', { required: true })} />
          </div>
          <Button type="submit" disabled={loading}>修改密码</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function NetworkMonitorSettings() {
  const [loading, setLoading] = useState(false);
  const [servers, setServers] = useState<{ id: number; name: string }[]>([]);
  const { register, control, handleSubmit, reset } = useForm<{ monitors: any[], selectedServers: string[] }>({
    defaultValues: { monitors: [], selectedServers: [] }
  });
  
  const { fields, append, remove } = useFieldArray({
    control,
    name: "monitors"
  });

  useEffect(() => {
    Promise.all([systemApi.networkMonitors(), vpsApi.list({ page: 1, pageSize: 200 })]).then(([mon, srv]) => {
      reset({ monitors: mon.data.items || [], selectedServers: [] });
      setServers(srv.data.items || []);
    });
  }, [reset]);

  const onSave = async (data: any) => {
    setLoading(true);
    try {
      await systemApi.updateNetworkMonitors(data.monitors);
      message.success('配置已保存');
    } catch {
      message.error('保存失败');
    } finally {
      setLoading(false);
    }
  };

  const onApply = async (data: any) => {
    if (!data.selectedServers?.length) {
      message.warning('请选择服务器');
      return;
    }
    setLoading(true);
    try {
      await systemApi.applyNetworkMonitors(data.selectedServers.map(Number));
      message.success('已应用到服务器');
    } catch {
      message.error('应用失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuNetwork className="h-5 w-5" />
          网络监控配置
        </CardTitle>
        <CardDescription>配置Ping监控目标，并下发到Agent执行</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit(onSave)} className="space-y-4">
          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="grid gap-4 md:grid-cols-12 items-end border p-4 rounded-md bg-slate-50 dark:bg-slate-900 dark:border-slate-800">
                <div className="md:col-span-2 space-y-2">
                  <Label>名称</Label>
                  <Input {...register(`monitors.${index}.name` as const, { required: true })} placeholder="如: Google" />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <Label>类型</Label>
                  <Select {...register(`monitors.${index}.type` as const)}>
                    <option value="icmp">ICMP</option>
                    <option value="tcp">TCP</option>
                  </Select>
                </div>
                <div className="md:col-span-3 space-y-2">
                  <Label>目标 (Host:Port)</Label>
                  <Input {...register(`monitors.${index}.target` as const, { required: true })} placeholder="8.8.8.8" />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <Label>频率(s)</Label>
                  <Input type="number" {...register(`monitors.${index}.interval` as const)} defaultValue={60} />
                </div>
                <div className="md:col-span-2 flex items-center h-10 space-x-2">
                   <Controller
                      control={control}
                      name={`monitors.${index}.enabled` as const}
                      defaultValue={true}
                      render={({ field: { value, onChange } }) => (
                        <div className="flex items-center space-x-2">
                          <Switch checked={value} onCheckedChange={onChange} />
                          <span className="text-sm text-slate-500">启用</span>
                        </div>
                      )}
                   />
                </div>
                <div className="md:col-span-1">
                  <Button type="button" variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-100" onClick={() => remove(index)}>
                    <DeleteOutlined />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" onClick={() => append({ name: '', type: 'icmp', target: '', interval: 60, enabled: true })}>
            <PlusOutlined className="mr-2" /> 添加监控项
          </Button>
          <div className="pt-4">
             <Button type="submit" disabled={loading}>保存配置</Button>
          </div>
        </form>

        <div className="border-t pt-6 mt-6 dark:border-slate-800">
           <h4 className="text-sm font-medium mb-4">应用到服务器</h4>
           <div className="flex gap-4 items-end">
              <div className="w-full max-w-md">
                 <Controller
                    control={control}
                    name="selectedServers"
                    render={({ field: { value, onChange } }) => (
                       <Select multiple value={value} onChange={e => {
                          const options = Array.from((e.target as HTMLSelectElement).selectedOptions, option => option.value);
                          onChange(options);
                       }} className="h-24">
                          {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                       </Select>
                    )}
                 />
                 <p className="text-xs text-slate-500 mt-1">按住 Ctrl/Cmd 多选</p>
              </div>
              <Button onClick={handleSubmit(onApply)} disabled={loading} variant="secondary">
                 <ReloadOutlined className="mr-2" /> 下发配置
              </Button>
           </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AuditLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [page, setPage] = useState(1);

  const fetchLogs = async (p = 1) => {
    try {
      const res = await systemApi.auditLogs({ page: p, pageSize: 20 });
      setLogs(res.data.items || []);
      setPage(p);
    } catch {
      message.error('获取审计日志失败');
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
           <CardTitle className="flex items-center gap-2">
             <LuFileText className="h-5 w-5" />
             审计日志
           </CardTitle>
           <Button variant="ghost" size="sm" onClick={() => fetchLogs(page)}><ReloadOutlined /></Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>动作</TableHead>
              <TableHead>目标类型</TableHead>
              <TableHead>目标ID</TableHead>
              <TableHead>详情</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map(log => (
              <TableRow key={log.id}>
                <TableCell className="whitespace-nowrap text-xs text-slate-500">{new Date(log.createdAt).toLocaleString()}</TableCell>
                <TableCell><Badge variant="outline">{log.action}</Badge></TableCell>
                <TableCell>{log.targetType}</TableCell>
                <TableCell>{log.targetId}</TableCell>
                <TableCell className="font-mono text-xs max-w-[300px] truncate" title={log.details}>
                   {log.details}
                </TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center h-24 text-slate-500">暂无日志</TableCell></TableRow>}
          </TableBody>
        </Table>
        
        <div className="flex items-center justify-end space-x-2 py-4">
          <Button variant="outline" size="sm" onClick={() => fetchLogs(Math.max(1, page - 1))} disabled={page === 1}>上一页</Button>
          <span className="text-sm text-slate-600 dark:text-slate-400">第 {page} 页</span>
          <Button variant="outline" size="sm" onClick={() => fetchLogs(page + 1)} disabled={logs.length < 20}>下一页</Button>
        </div>
      </CardContent>
    </Card>
  );
}
