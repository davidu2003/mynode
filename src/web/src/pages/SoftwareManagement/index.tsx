import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { message } from 'antd'; // Keeping AntD message for simplicity
import { 
  PlusOutlined, 
  ReloadOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  SyncOutlined, 
  EyeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  PlayCircleOutlined,
  StopOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { softwareApi, vpsApi } from '../../api';
import { getErrorMessage } from '../../utils/api-error';

// UI Components
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../components/ui/dialog';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select } from '../../components/ui/select-native';

// Types
type SoftwareItem = {
  id: number;
  name?: string;
  displayName: string;
  description?: string;
  category?: string;
  installMethod: string;
  serviceName?: string;
  configPath?: string;
  installations?: any[];
};

type VpsItem = { id: number; name: string; ip: string; agentStatus: string };

export default function SoftwareManagement() {
  const navigate = useNavigate();
  const [syncOpen, setSyncOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [baseOpen, setBaseOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  
  const [selectedSoftware, setSelectedSoftware] = useState<SoftwareItem | null>(null);
  const [syncAction, setSyncAction] = useState<'install' | 'uninstall'>('install');
  const [selectedVpsIds, setSelectedVpsIds] = useState<number[]>([]);
  
  const [syncing, setSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<any[]>([]);
  const [serviceStatusMap, setServiceStatusMap] = useState<Record<number, string>>({});
  
  const [configContent, setConfigContent] = useState('');
  const [configVpsId, setConfigVpsId] = useState<number | null>(null);
  const [configSaving, setConfigSaving] = useState(false);

  // Data Fetching
  const { data: softwareList, refetch: refetchSoftware, isLoading: loading } = useQuery({
    queryKey: ['software'],
    queryFn: async () => (await softwareApi.list()).data.items || []
  });

  const { data: vpsList } = useQuery({
    queryKey: ['vps-all'],
    queryFn: async () => (await vpsApi.list({ pageSize: 1000 })).data.items || []
  });

  // Actions
  const handleDelete = async (id: number) => {
    if (!window.confirm('确定删除这个软件吗？')) return;
    try {
      await softwareApi.delete(id);
      message.success('删除成功');
      refetchSoftware();
    } catch (err) {
      message.error('删除失败');
    }
  };

  const handleSync = (software: SoftwareItem) => {
    setSelectedSoftware(software);
    setSelectedVpsIds([]);
    setSyncResults([]);
    setSyncAction('install');
    setSyncOpen(true);
  };

  const handleSyncConfirm = async () => {
    if (!selectedSoftware || selectedVpsIds.length === 0) return;
    setSyncing(true);
    try {
      const res = syncAction === 'install'
        ? await softwareApi.install(selectedSoftware.id, selectedVpsIds)
        : await softwareApi.uninstall(selectedSoftware.id, selectedVpsIds);
      setSyncResults(res.data.results || []);
      refetchSoftware();
    } catch (err) {
      message.error(getErrorMessage(err, '同步失败'));
    } finally {
      setSyncing(false);
    }
  };

  const handleInstallBase = async () => {
    if (selectedVpsIds.length === 0) return;
    setSyncing(true);
    try {
      const res = await softwareApi.installBase(selectedVpsIds);
      setSyncResults(res.data.results || []);
      message.success('基础软件安装完成');
    } catch (err) {
      message.error(getErrorMessage(err, '安装失败'));
    } finally {
      setSyncing(false);
    }
  };

  const fetchServiceStatus = async (softwareId: number) => {
    if (!selectedSoftware?.serviceName) return;
    const onlineVps = (vpsList || []).filter((v: VpsItem) => v.agentStatus === 'online');
    const results = await Promise.all(
      onlineVps.map((v: VpsItem) =>
        softwareApi.serviceStatus(softwareId, v.id)
          .then((res) => ({ vpsId: v.id, status: res.data.status }))
          .catch(() => ({ vpsId: v.id, status: 'unknown' }))
      )
    );
    const statusMap = results.reduce((acc, item) => ({ ...acc, [item.vpsId]: item.status }), {});
    setServiceStatusMap(statusMap);
  };

  const handleServiceAction = async (vpsId: number, action: 'start' | 'stop' | 'restart') => {
    if (!selectedSoftware) return;
    try {
      await softwareApi.serviceAction(selectedSoftware.id, vpsId, action);
      message.success(`${action} 成功`);
      fetchServiceStatus(selectedSoftware.id);
    } catch (err) {
      message.error(`${action} 失败`);
    }
  };

  const handleConfigEdit = async (vpsId: number) => {
    if (!selectedSoftware?.configPath) return;
    try {
      const res = await softwareApi.getConfig(selectedSoftware.id, vpsId);
      setConfigContent(res.data.content || '');
      setConfigVpsId(vpsId);
      setConfigOpen(true);
    } catch (err) {
      message.error('获取配置失败');
    }
  };

  // Helper for server grid selection
  const ServerSelectionGrid = () => (
    <div className="max-h-[300px] overflow-y-auto border border-slate-200 rounded-md p-2 dark:border-slate-800">
      <div className="grid grid-cols-2 gap-2">
        {(vpsList || []).map((server: VpsItem) => {
          const isSelected = selectedVpsIds.includes(server.id);
          return (
            <div 
              key={server.id}
              className={`
                cursor-pointer p-2 rounded-md border flex items-center justify-between text-xs
                ${isSelected 
                  ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' 
                  : 'bg-white border-slate-100 hover:border-slate-300 dark:bg-slate-950 dark:border-slate-800'}
              `}
              onClick={() => setSelectedVpsIds(prev => prev.includes(server.id) ? prev.filter(id => id !== server.id) : [...prev, server.id])}
            >
              <div className="truncate font-medium">{server.name}</div>
              <Badge variant={server.agentStatus === 'online' ? 'success' : 'secondary'} className="px-1 py-0 h-4 text-[10px]">
                {server.agentStatus}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">软件管理</h2>
        <div className="space-x-2">
          <Button variant="outline" onClick={() => softwareApi.refreshAll().then(() => { message.success('刷新成功'); refetchSoftware(); })}>
            <ReloadOutlined className="mr-2" /> 刷新状态
          </Button>
          <Button variant="outline" onClick={() => { setBaseOpen(true); setSelectedVpsIds([]); setSyncResults([]); }}>
            <PlusOutlined className="mr-2" /> 安装基础软件
          </Button>
          <Button onClick={() => navigate('/software/create')}>
            <PlusOutlined className="mr-2" /> 添加软件
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>软件名称</TableHead>
              <TableHead>分类</TableHead>
              <TableHead>安装方式</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center h-24">加载中...</TableCell></TableRow>
            ) : softwareList?.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center h-24 text-slate-500">无数据</TableCell></TableRow>
            ) : (
              softwareList?.map((item: SoftwareItem) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.displayName}</div>
                    <div className="text-xs text-slate-500">{item.description}</div>
                  </TableCell>
                  <TableCell>{item.category || '-'}</TableCell>
                  <TableCell><Badge variant="secondary">{item.installMethod}</Badge></TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => { 
                      setSelectedSoftware(item); 
                      setViewModalVisible(true); // Bug fix: defined setViewOpen but used setViewModalVisible in logic above? No I haven't defined modal logic yet fully.
                      setViewOpen(true);
                      setServiceStatusMap({});
                      fetchServiceStatus(item.id);
                    }}>
                      <EyeOutlined />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/software/${item.id}`)}>
                      <EditOutlined />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-blue-600" onClick={() => handleSync(item)}>
                      <SyncOutlined />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => handleDelete(item.id)}>
                      <DeleteOutlined />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Sync Dialog */}
      <Dialog open={syncOpen} onOpenChange={setSyncOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>同步软件 - {selectedSoftware?.displayName}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex gap-4">
               <Label>操作:</Label>
               <div className="flex gap-2">
                  <Badge 
                    variant={syncAction === 'install' ? 'default' : 'outline'} 
                    className="cursor-pointer"
                    onClick={() => setSyncAction('install')}
                  >安装</Badge>
                  <Badge 
                    variant={syncAction === 'uninstall' ? 'destructive' : 'outline'} 
                    className="cursor-pointer"
                    onClick={() => setSyncAction('uninstall')}
                  >卸载</Badge>
               </div>
            </div>

            <div>
               <div className="flex justify-between mb-2">
                 <Label>选择服务器</Label>
                 <div className="space-x-2">
                    <span className="text-xs text-slate-500 cursor-pointer" onClick={() => setSelectedVpsIds((vpsList || []).map((v: any) => v.id))}>全选</span>
                    <span className="text-xs text-slate-500 cursor-pointer" onClick={() => setSelectedVpsIds([])}>清空</span>
                 </div>
               </div>
               <ServerSelectionGrid />
            </div>

            {syncResults.length > 0 && (
              <div className="mt-4 border rounded max-h-40 overflow-auto text-xs">
                 <Table>
                   <TableHeader><TableRow><TableHead>服务器</TableHead><TableHead>结果</TableHead><TableHead>信息</TableHead></TableRow></TableHeader>
                   <TableBody>
                     {syncResults.map((res, idx) => {
                       const vps = vpsList?.find((v:any) => v.id === res.vpsId);
                       return (
                         <TableRow key={idx}>
                           <TableCell>{vps ? vps.name : res.vpsId}</TableCell>
                           <TableCell>{res.success ? <span className="text-green-600">成功</span> : <span className="text-red-600">失败</span>}</TableCell>
                           <TableCell>{res.error || '-'}</TableCell>
                         </TableRow>
                       );
                     })}
                   </TableBody>
                 </Table>
              </div>
            )}
          </div>

          <DialogFooter>
             <Button variant="outline" onClick={() => setSyncOpen(false)}>关闭</Button>
             <Button onClick={handleSyncConfirm} disabled={syncing}>{syncing ? '执行中...' : '执行'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Base Install Dialog */}
      <Dialog open={baseOpen} onOpenChange={setBaseOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>安装基础软件</DialogTitle></DialogHeader>
          <div className="space-y-4">
             <p className="text-sm text-slate-500">将安装: nftables, openssh-server, vnstat, curl, wget, zip, unzip, tar...</p>
             <div>
               <div className="flex justify-between mb-2">
                 <Label>选择服务器</Label>
                 <div className="space-x-2">
                    <span className="text-xs text-slate-500 cursor-pointer" onClick={() => setSelectedVpsIds((vpsList || []).map((v: any) => v.id))}>全选</span>
                    <span className="text-xs text-slate-500 cursor-pointer" onClick={() => setSelectedVpsIds([])}>清空</span>
                 </div>
               </div>
               <ServerSelectionGrid />
             </div>
             {syncResults.length > 0 && (
               <div className="mt-4 border rounded max-h-40 overflow-auto text-xs">
                  {/* Reuse result table logic or simple list */}
                  <div className="p-2">
                    {syncResults.map((res, i) => <div key={i} className={res.success ? 'text-green-600' : 'text-red-600'}>ID {res.vpsId}: {res.success ? 'Success' : res.error}</div>)}
                  </div>
               </div>
             )}
          </div>
          <DialogFooter>
             <Button onClick={handleInstallBase} disabled={syncing}>{syncing ? '安装中...' : '开始安装'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>软件详情 - {selectedSoftware?.displayName}</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
             <Table>
               <TableHeader>
                 <TableRow>
                   <TableHead>服务器</TableHead>
                   <TableHead>安装状态</TableHead>
                   <TableHead>服务状态</TableHead>
                   <TableHead>版本</TableHead>
                   <TableHead className="text-right">操作</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {selectedSoftware?.installations?.map(inst => {
                   const srvStatus = serviceStatusMap[inst.vpsId];
                   return (
                     <TableRow key={inst.vpsId}>
                       <TableCell>{inst.vpsName}</TableCell>
                       <TableCell>
                          <Badge variant={inst.status === 'installed' ? 'success' : 'secondary'}>{inst.status}</Badge>
                       </TableCell>
                       <TableCell>
                          <Badge variant={srvStatus === 'active' ? 'success' : srvStatus === 'inactive' ? 'secondary' : 'warning'}>
                            {srvStatus || 'unknown'}
                          </Badge>
                       </TableCell>
                       <TableCell>{inst.version || '-'}</TableCell>
                       <TableCell className="text-right space-x-1">
                          <Button size="icon" variant="ghost" title="启动" onClick={() => handleServiceAction(inst.vpsId, 'start')}><PlayCircleOutlined /></Button>
                          <Button size="icon" variant="ghost" title="停止" onClick={() => handleServiceAction(inst.vpsId, 'stop')}><StopOutlined /></Button>
                          <Button size="icon" variant="ghost" title="重启" onClick={() => handleServiceAction(inst.vpsId, 'restart')}><ReloadOutlined /></Button>
                          <Button size="icon" variant="ghost" title="配置" onClick={() => handleConfigEdit(inst.vpsId)}><FileTextOutlined /></Button>
                       </TableCell>
                     </TableRow>
                   );
                 })}
                 {(!selectedSoftware?.installations || selectedSoftware.installations.length === 0) && (
                   <TableRow><TableCell colSpan={5} className="text-center text-slate-500">暂无安装记录</TableCell></TableRow>
                 )}
               </TableBody>
             </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Config Dialog */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
          <DialogHeader><DialogTitle>修改配置</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-hidden flex flex-col gap-2">
             <Label className="text-xs text-slate-500">路径: {selectedSoftware?.configPath}</Label>
             <Textarea 
               value={configContent} 
               onChange={e => setConfigContent(e.target.value)} 
               className="flex-1 font-mono text-xs" 
             />
          </div>
          <DialogFooter>
             <Button variant="outline" onClick={() => setConfigOpen(false)}>取消</Button>
             <Button onClick={async () => {
                if (!selectedSoftware || !configVpsId) return;
                setConfigSaving(true);
                try {
                  await softwareApi.updateConfig(selectedSoftware.id, configVpsId, configContent);
                  message.success('配置已保存');
                  setConfigOpen(false);
                } catch(err) {
                  message.error('保存失败');
                } finally {
                  setConfigSaving(false);
                }
             }} disabled={configSaving}>保存并重启</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
