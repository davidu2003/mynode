import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { ExclamationCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { message, Steps } from 'antd'; // Use AntD Steps for now as implementing a custom stepper is time consuming
import { ddApi } from '../api';
import { getErrorMessage } from '../utils/api-error';
import dayjs from 'dayjs';

// UI Components
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select-native';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'; // Need to create Alert

interface DDModalProps {
  visible: boolean;
  vpsId: number;
  vpsName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const statusMap: Record<string, { text: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" }> = {
  pending: { text: '等待中', variant: 'secondary' },
  executing: { text: '执行脚本', variant: 'default' },
  rebooting: { text: '重启中', variant: 'warning' },
  waiting: { text: '等待完成', variant: 'warning' },
  reconnecting: { text: '重新连接', variant: 'default' },
  installing_agent: { text: '安装Agent', variant: 'default' },
  completed: { text: '已完成', variant: 'success' },
  failed: { text: '失败', variant: 'destructive' },
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

export default function DDModal({ visible, vpsId, vpsName, onClose, onSuccess }: DDModalProps) {
  const [loading, setLoading] = useState(false);
  const [supportedOS, setSupportedOS] = useState<Record<string, string[]>>({});
  const [taskId, setTaskId] = useState<number | null>(null);
  const [taskStatus, setTaskStatus] = useState<DdTaskStatus | null>(null);
  const [polling, setPolling] = useState(false);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<DdStartValues>({
    defaultValues: { newSshPort: 22 }
  });
  
  const selectedOS = watch('targetOs');

  // Load Supported OS
  useEffect(() => {
    if (visible) {
      ddApi.getSupportedOS().then((res) => setSupportedOS(res.data)).catch(() => message.error('获取系统列表失败'));
    }
  }, [visible]);

  // Polling Logic
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
        }
      } catch (err) {
        console.error('Task status error:', err);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [taskId, polling, onSuccess]);

  const startDD = async (values: DdStartValues, force?: boolean) => {
    setLoading(true);
    try {
      const res = await ddApi.start(vpsId, values, { force });
      setTaskId(res.data.taskId);
      setPolling(true);
    } catch (err: unknown) {
      const msg = getErrorMessage(err, '启动失败');
      if (!force && msg.includes('已有正在进行的DD任务')) {
        if(window.confirm('检测到正在进行的DD任务，是否强制重新开始？')) {
           startDD(values, true);
        }
      } else {
        message.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (values: DdStartValues) => {
    if (window.confirm(`警告：DD重装将清除VPS上的所有数据！\n目标系统：${values.targetOs} ${values.targetVersion}\n确认继续？`)) {
      startDD(values);
    }
  };

  const handleClose = () => {
    if (polling) {
      if (window.confirm('任务正在进行中，确认关闭弹窗？(任务将在后台继续)')) {
        setPolling(false); onClose();
      }
    } else {
      onClose();
    }
  };

  const currentStep = taskStatus ? Math.max(0, statusSteps.indexOf(taskStatus.status)) : 0;

  return (
    <Dialog open={visible} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>DD系统重装 - {vpsName}</DialogTitle>
          <DialogDescription>使用自动化脚本重装操作系统，将清除所有数据。</DialogDescription>
        </DialogHeader>

        {taskId ? (
          <div className="space-y-6 py-4">
             {/* Keep AntD Steps for visual clarity on progress */}
             <Steps
               size="small"
               current={currentStep}
               status={taskStatus?.status === 'failed' ? 'error' : 'process'}
               items={[{ title: '开始' }, { title: '脚本' }, { title: '重启' }, { title: '等待' }, { title: '完成' }]} 
             />
             
             <div className="text-center space-y-4">
                <Badge variant={statusMap[taskStatus?.status || 'pending']?.variant}>
                  {statusMap[taskStatus?.status || 'pending']?.text || taskStatus?.status}
                </Badge>
                
                {taskStatus?.status === 'waiting' && <p className="text-sm text-slate-500">正在等待VPS重装完成，这可能需要5-15分钟...</p>}
                
                {taskStatus?.status === 'failed' && taskStatus?.errorMessage && (
                  <Alert variant="destructive" className="text-left">
                    <AlertTitle>重装失败</AlertTitle>
                    <AlertDescription>{taskStatus.errorMessage}</AlertDescription>
                  </Alert>
                )}

                {taskStatus?.commandOutput && (
                   <Alert className="text-left bg-slate-950 border-slate-800">
                     <AlertTitle className="text-slate-400 text-xs">执行输出</AlertTitle>
                     <AlertDescription>
                        <pre className="mt-2 text-slate-300 font-mono text-[10px] h-32 overflow-auto whitespace-pre-wrap">
                          {taskStatus.commandOutput}
                        </pre>
                     </AlertDescription>
                   </Alert>
                )}

                {taskStatus?.status === 'completed' && (
                  <Alert variant="default" className="text-left bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-900/50">
                    <AlertTitle className="text-green-800 dark:text-green-400">重装完成</AlertTitle>
                    <AlertDescription className="text-green-700 dark:text-green-500">VPS已成功重装，Agent正在重新连接中...</AlertDescription>
                  </Alert>
                )}
             </div>
             
             <div className="flex justify-center">
                <Button onClick={handleClose}>
                  {['completed', 'failed'].includes(taskStatus?.status || '') ? '关闭' : '后台运行'}
                </Button>
             </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
             <Alert variant="warning">
                <ExclamationCircleOutlined className="h-4 w-4" />
                <AlertTitle>高危操作</AlertTitle>
                <AlertDescription>警告：操作不可逆，请确保已备份数据。</AlertDescription>
             </Alert>

             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                   <Label>目标系统</Label>
                   <Select {...register('targetOs', { required: true })}>
                      <option value="">请选择</option>
                      {Object.keys(supportedOS).map(os => <option key={os} value={os}>{os}</option>)}
                   </Select>
                </div>
                <div className="space-y-2">
                   <Label>版本</Label>
                   <Select {...register('targetVersion', { required: true })} disabled={!selectedOS}>
                      {(supportedOS[selectedOS] || []).map(v => <option key={v} value={v}>{v}</option>)}
                   </Select>
                </div>
             </div>

             <div className="space-y-2">
                <Label>新 Root 密码</Label>
                <Input type="password" {...register('newPassword', { required: true, minLength: 8 })} placeholder="至少8位字符" />
                {errors.newPassword && <span className="text-xs text-red-500">密码长度至少8位</span>}
             </div>

             <div className="space-y-2">
                <Label>新 SSH 端口</Label>
                <Input type="number" {...register('newSshPort', { required: true })} placeholder="22" />
             </div>

             <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={onClose}>取消</Button>
                <Button type="submit" variant="destructive" disabled={loading}>
                   {loading && <ReloadOutlined className="mr-2 animate-spin" />} 开始重装
                </Button>
             </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// History Component
interface DDHistoryItem {
  id: number;
  targetOs: string;
  targetVersion: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  newSshPort?: number;
}

export function DDHistory({ vpsId }: { vpsId: number }) {
  const [history, setHistory] = useState<DDHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await ddApi.getHistory(vpsId);
      setHistory(res.data.items || []);
    } catch(err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHistory(); }, [vpsId]);

  return (
    <div className="space-y-4">
       <div className="flex justify-between items-center">
          <h4 className="font-medium text-sm">历史记录</h4>
          <Button variant="ghost" size="sm" onClick={fetchHistory} disabled={loading}>
             <ReloadOutlined className={loading ? 'animate-spin' : ''} />
          </Button>
       </div>
       <div className="border rounded-md border-slate-200 dark:border-slate-800">
         <Table>
           <TableHeader>
             <TableRow>
               <TableHead>系统</TableHead>
               <TableHead>端口</TableHead>
               <TableHead>状态</TableHead>
               <TableHead>开始时间</TableHead>
               <TableHead>完成时间</TableHead>
             </TableRow>
           </TableHeader>
           <TableBody>
             {history.length === 0 ? (
               <TableRow><TableCell colSpan={5} className="text-center h-20 text-slate-500">无记录</TableCell></TableRow>
             ) : (
               history.map(item => (
                 <TableRow key={item.id}>
                    <TableCell>{item.targetOs} {item.targetVersion}</TableCell>
                    <TableCell>{item.newSshPort}</TableCell>
                    <TableCell>
                       <Badge variant={statusMap[item.status]?.variant || 'outline'}>
                         {statusMap[item.status]?.text || item.status}
                       </Badge>
                    </TableCell>
                    <TableCell>{dayjs(item.startedAt).format('MM-DD HH:mm')}</TableCell>
                    <TableCell>{item.completedAt ? dayjs(item.completedAt).format('MM-DD HH:mm') : '-'}</TableCell>
                 </TableRow>
               ))
             )}
           </TableBody>
         </Table>
       </div>
    </div>
  );
}
