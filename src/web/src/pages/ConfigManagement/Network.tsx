import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { message } from 'antd';
import { SaveOutlined, SyncOutlined, RollbackOutlined } from '@ant-design/icons';
import { LuNetwork } from "react-icons/lu";
import { configModuleApi, vpsApi } from '../../api';

// UI Components
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Textarea } from '../../components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import ServerSelectionGrid from '../../components/ServerSelectionGrid';

type NetworkConfig = {
  enableBbrFq: boolean;
  disableIpv6: boolean;
  preferIpv4: boolean;
  customSysctl: string;
};

export default function NetworkConfigPage() {
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  
  const { register, handleSubmit, control, reset } = useForm<NetworkConfig>();
  const { register: regDetail, control: ctlDetail, reset: resetDetail, handleSubmit: subDetail } = useForm<NetworkConfig>();

  const [allVps, setAllVps] = useState<any[]>([]);
  const [vpsStatusMap, setVpsStatusMap] = useState<Record<number, any>>({});
  
  const [syncOpen, setSyncOpen] = useState(false);
  const [selectedVpsIds, setSelectedVpsIds] = useState<number[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<any[]>([]);
  
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailVpsId, setDetailVpsId] = useState<number | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);

  const fetchConfig = async () => {
    try {
      const res = await configModuleApi.get('network');
      reset(res.data.content || {});
      setUpdatedAt(res.data.updatedAt || null);
    } catch (err) {
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
        configModuleApi.getVps('network', v.id)
          .then(res => ({ id: v.id, data: res.data?.content }))
          .catch(() => ({ id: v.id, error: true }))
      )
    );
    
    setVpsStatusMap(prev => {
      const next = { ...prev };
      results.forEach(r => { if (r.data) next[r.id] = r.data; });
      return next;
    });
    message.success('状态已刷新');
  };

  const onSave = async (data: NetworkConfig) => {
    setSaving(true);
    try {
      await configModuleApi.update('network', data);
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
      await configModuleApi.rollback('network');
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
      const res = await configModuleApi.sync('network', selectedVpsIds);
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
      const res = await configModuleApi.getVps('network', id);
      resetDetail(res.data.content || {});
      setDetailVpsId(id);
      setDetailOpen(true);
    } catch {
      message.error('获取详情失败');
    }
  };

  const onDetailSave = async (data: NetworkConfig) => {
    if (!detailVpsId) return;
    setDetailSaving(true);
    try {
      const res = await configModuleApi.updateVps('network', detailVpsId, data);
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
            <LuNetwork className="h-6 w-6" />
            网络配置
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
                <div className="flex items-center justify-between border p-3 rounded-md dark:border-slate-800">
                  <Label>开启 BBR + FQ</Label>
                  <Controller control={control} name="enableBbrFq" render={({ field: { value, onChange } }) => (
                    <Switch checked={value} onCheckedChange={onChange} />
                  )}/>
                </div>

                <div className="flex items-center justify-between border p-3 rounded-md dark:border-slate-800">
                  <Label>禁用 IPv6</Label>
                  <Controller control={control} name="disableIpv6" render={({ field: { value, onChange } }) => (
                    <Switch checked={value} onCheckedChange={onChange} />
                  )}/>
                </div>

                <div className="flex items-center justify-between border p-3 rounded-md dark:border-slate-800">
                  <Label>IPv4 优先</Label>
                  <Controller control={control} name="preferIpv4" render={({ field: { value, onChange } }) => (
                    <Switch checked={value} onCheckedChange={onChange} />
                  )}/>
                </div>

                <div className="space-y-2">
                  <Label>自定义 Sysctl</Label>
                  <Textarea {...register('customSysctl')} placeholder="net.ipv4.tcp_tw_reuse = 1" rows={6} className="font-mono text-xs" />
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
                    <TableHead>BBR</TableHead>
                    <TableHead>禁用IPv6</TableHead>
                    <TableHead>IPv4优先</TableHead>
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
                           {status ? (status.enableBbrFq ? <Badge variant="success">开启</Badge> : <Badge variant="secondary">关闭</Badge>) : <span className="text-slate-400">-</span>}
                        </TableCell>
                        <TableCell>
                           {status ? (status.disableIpv6 ? <Badge variant="success">开启</Badge> : <Badge variant="secondary">关闭</Badge>) : <span className="text-slate-400">-</span>}
                        </TableCell>
                        <TableCell>
                           {status ? (status.preferIpv4 ? <Badge variant="success">开启</Badge> : <Badge variant="secondary">关闭</Badge>) : <span className="text-slate-400">-</span>}
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
          <DialogHeader><DialogTitle>同步网络配置</DialogTitle></DialogHeader>
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
             <div className="flex justify-between items-center border p-3 rounded">
                <Label>BBR + FQ</Label>
                <Controller control={ctlDetail} name="enableBbrFq" render={({ field: { value, onChange } }) => (
                  <Switch checked={value} onCheckedChange={onChange} />
                )}/>
             </div>
             <div className="flex justify-between items-center border p-3 rounded">
                <Label>禁用 IPv6</Label>
                <Controller control={ctlDetail} name="disableIpv6" render={({ field: { value, onChange } }) => (
                  <Switch checked={value} onCheckedChange={onChange} />
                )}/>
             </div>
             <div className="flex justify-between items-center border p-3 rounded">
                <Label>IPv4 优先</Label>
                <Controller control={ctlDetail} name="preferIpv4" render={({ field: { value, onChange } }) => (
                  <Switch checked={value} onCheckedChange={onChange} />
                )}/>
             </div>
             <div className="space-y-2">
                <Label>自定义 Sysctl</Label>
                <Textarea {...regDetail('customSysctl')} rows={6} className="font-mono text-xs" />
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
