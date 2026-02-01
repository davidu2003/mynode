import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { message } from 'antd';
import { SaveOutlined, SyncOutlined, RollbackOutlined } from '@ant-design/icons';
import { LuClock } from "react-icons/lu";
import { configModuleApi, vpsApi } from '../../api';

// UI Components
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Select } from '../../components/ui/select-native';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import ServerSelectionGrid from '../../components/ServerSelectionGrid';

type TimezoneConfig = {
  timezone: string;
  enableNtp: boolean;
};

type VpsItem = {
  id: number;
  name: string;
  agentStatus: string;
};

type SyncResult = {
  vpsId: number;
  success: boolean;
  error?: string;
};

const fallbackTimezones = [
  'UTC', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Singapore',
  'Asia/Bangkok', 'Asia/Jakarta', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Moscow', 'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'America/Sao_Paulo', 'Australia/Sydney',
];

const intlWithSupportedValues = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[]; };
const timezones = typeof Intl !== 'undefined' && typeof intlWithSupportedValues.supportedValuesOf === 'function'
    ? intlWithSupportedValues.supportedValuesOf('timeZone')
    : fallbackTimezones;

export default function TimezoneConfigPage() {
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  
  const { register, handleSubmit, control, reset } = useForm<TimezoneConfig>();
  const { register: regDetail, control: ctlDetail, reset: resetDetail, handleSubmit: subDetail } = useForm<TimezoneConfig>();

  const [allVps, setAllVps] = useState<VpsItem[]>([]);
  const [vpsStatusMap, setVpsStatusMap] = useState<Record<number, TimezoneConfig>>({});
  
  const [syncOpen, setSyncOpen] = useState(false);
  const [selectedVpsIds, setSelectedVpsIds] = useState<number[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<SyncResult[]>([]);
  
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailVpsId, setDetailVpsId] = useState<number | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);

  const fetchConfig = async () => {
    try {
      const res = await configModuleApi.get('timezone');
      reset(res.data.content || { timezone: 'UTC', enableNtp: true });
      setUpdatedAt(res.data.updatedAt || null);
    } catch {
      message.error('获取配置失败');
    }
  };

  const fetchVpsList = async () => {
    try {
      const res = await vpsApi.list({ pageSize: 1000 });
      setAllVps(res.data.items || []);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    fetchConfig();
    fetchVpsList();
  }, []);

  const refreshServerStatus = async () => {
    const onlineVps = allVps.filter(v => v.agentStatus === 'online');
    if (onlineVps.length === 0) return;
    
    const results = await Promise.all(
      onlineVps.map(v => 
        configModuleApi.getVps('timezone', v.id)
          .then(res => ({ id: v.id, data: res.data?.content }))
          .catch(() => ({ id: v.id, error: true }))
      )
    );
    
    setVpsStatusMap(prev => {
      const next = { ...prev };
      results.forEach(r => { if ('data' in r && r.data) next[r.id] = r.data; });
      return next;
    });
    message.success('状态已刷新');
  };

  const onSave = async (data: TimezoneConfig) => {
    setSaving(true);
    try {
      await configModuleApi.update('timezone', data);
      message.success('保存成功');
      fetchConfig();
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const onRollback = async () => {
    if (!window.confirm('确认回滚到上一个版本？')) return;
    try {
      await configModuleApi.rollback('timezone');
      message.success('回滚成功');
      fetchConfig();
    } catch {
      message.error('回滚失败');
    }
  };

  const onSync = async () => {
    if (selectedVpsIds.length === 0) return;
    setSyncing(true);
    try {
      const res = await configModuleApi.sync('timezone', selectedVpsIds);
      setSyncResults(res.data.results || []);
      message.success('同步完成');
    } catch {
      message.error('同步失败');
    } finally {
      setSyncing(false);
    }
  };

  const openDetail = async (id: number) => {
    try {
      const res = await configModuleApi.getVps('timezone', id);
      resetDetail(res.data.content || {});
      setDetailVpsId(id);
      setDetailOpen(true);
    } catch {
      message.error('获取详情失败');
    }
  };

  const onDetailSave = async (data: TimezoneConfig) => {
    if (!detailVpsId) return;
    setDetailSaving(true);
    try {
      const res = await configModuleApi.updateVps('timezone', detailVpsId, data);
      if (res.data?.success) message.success('同步完成');
      setDetailOpen(false);
      setVpsStatusMap(prev => ({ ...prev, [detailVpsId]: data }));
    } catch {
      message.error('同步失败');
    } finally {
      setDetailSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 flex items-center gap-2">
            <LuClock className="h-6 w-6" />
            时区配置
          </h2>
          <p className="text-sm text-slate-500">最后更新: {updatedAt ? new Date(updatedAt).toLocaleString() : '从未'}</p>
        </div>
      </div>

      <Tabs defaultValue="global" className="space-y-4">
        <TabsList>
          <TabsTrigger value="global">全局配置</TabsTrigger>
          <TabsTrigger value="servers">配置查看</TabsTrigger>
        </TabsList>

        <TabsContent value="global">
          <Card>
            <CardHeader><CardTitle>全局策略</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleSubmit(onSave)} className="space-y-4">
                <div className="space-y-2">
                  <Label>时区</Label>
                  <Select {...register('timezone', { required: true })}>
                    {timezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </Select>
                </div>

                <div className="flex items-center justify-between border p-3 rounded-md dark:border-slate-800">
                  <Label>网络时间同步 (NTP)</Label>
                  <Controller control={control} name="enableNtp" render={({ field: { value, onChange } }) => (
                    <Switch checked={value} onCheckedChange={onChange} />
                  )}/>
                </div>

                <div className="flex gap-4 pt-4">
                   <Button type="button" variant="outline" onClick={onRollback}><RollbackOutlined className="mr-2"/>回滚</Button>
                   <Button type="submit" disabled={saving}><SaveOutlined className="mr-2"/>保存</Button>
                   <Button type="button" variant="secondary" onClick={() => { setSyncOpen(true); setSyncResults([]); setSelectedVpsIds([]); }}>
                     <SyncOutlined className="mr-2"/>同步
                   </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="servers">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
               <CardTitle>服务器状态</CardTitle>
               <Button size="sm" variant="ghost" onClick={refreshServerStatus}><SyncOutlined className="mr-2"/>刷新</Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>服务器</TableHead>
                    <TableHead>时区</TableHead>
                    <TableHead>NTP</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allVps.map(vps => {
                    const status = vpsStatusMap[vps.id];
                    return (
                      <TableRow key={vps.id}>
                        <TableCell>{vps.name}</TableCell>
                        <TableCell>
                           {status ? <Badge variant="outline">{status.timezone}</Badge> : <span className="text-slate-400">-</span>}
                        </TableCell>
                        <TableCell>
                           {status ? (status.enableNtp ? <Badge variant="success">开启</Badge> : <Badge variant="secondary">关闭</Badge>) : <span className="text-slate-400">-</span>}
                        </TableCell>
                        <TableCell className="text-right">
                           <Button size="sm" variant="ghost" disabled={vps.agentStatus !== 'online'} onClick={() => openDetail(vps.id)}>查看</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Sync Dialog */}
      <Dialog open={syncOpen} onOpenChange={setSyncOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>同步时区配置</DialogTitle></DialogHeader>
          <div className="space-y-4">
             <div className="flex justify-between items-center">
                <Label>选择服务器</Label>
                <div className="space-x-2 text-xs">
                   <span className="cursor-pointer text-slate-500 hover:text-slate-700" onClick={() => setSelectedVpsIds(allVps.filter(v => v.agentStatus === 'online').map(v => v.id))}>全选在线</span>
                   <span className="cursor-pointer text-slate-500 hover:text-slate-700" onClick={() => setSelectedVpsIds([])}>清空</span>
                </div>
             </div>
             <ServerSelectionGrid servers={allVps} selectedIds={selectedVpsIds} onChange={setSelectedVpsIds} />
             
             {syncResults.length > 0 && (
               <div className="max-h-40 overflow-y-auto border rounded p-2 text-xs">
                  {syncResults.map((r, i) => (
                    <div key={i} className={r.success ? 'text-green-600' : 'text-red-600'}>
                       ID {r.vpsId}: {r.success ? '成功' : r.error}
                    </div>
                  ))}
               </div>
             )}
          </div>
          <DialogFooter>
             <Button variant="outline" onClick={() => setSyncOpen(false)}>关闭</Button>
             <Button onClick={onSync} disabled={syncing}>执行同步</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>单机配置详情</DialogTitle></DialogHeader>
          <form onSubmit={subDetail(onDetailSave)} className="space-y-4">
             <div className="space-y-2">
                <Label>时区</Label>
                <Select {...regDetail('timezone')}>
                   {timezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </Select>
             </div>
             <div className="flex items-center justify-between border p-3 rounded-md dark:border-slate-800">
                <Label>网络时间同步</Label>
                <Controller control={ctlDetail} name="enableNtp" render={({ field: { value, onChange } }) => (
                  <Switch checked={value} onCheckedChange={onChange} />
                )}/>
             </div>
             <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDetailOpen(false)}>取消</Button>
                <Button type="submit" disabled={detailSaving}>保存并同步</Button>
             </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
