import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  PlusOutlined, 
  SearchOutlined, 
  ReloadOutlined, 
  DeleteOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { vpsApi } from '../../api';
import { useVPSStore } from '../../stores';

// UI Components
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '../../components/ui/table';
import { cn } from '../../lib/utils';
import CountryFlag from '../../components/CountryFlag';

// Types (copied from original, should be centralized)
type VpsTag = { id: number; name: string; color?: string };
type VpsBilling = { expireDate?: string };
type VpsListItem = {
  id: number;
  name: string;
  ip: string;
  sshPort?: number;
  agentStatus?: string;
  osType?: string;
  osVersion?: string;
  logo?: string;
  publicIpv4?: string;
  publicIpv6?: string;
  countryCode?: string;
  country?: string;
  billing?: VpsBilling;
  tags?: VpsTag[];
};

const statusMap: Record<string, { text: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" }> = {
  online: { text: '在线', variant: 'success' },
  offline: { text: '离线', variant: 'destructive' },
  pending: { text: '待安装', variant: 'warning' },
  installing: { text: '安装中', variant: 'default' }, // processing mapped to default (blue)
};

function nameInitial(name?: string): string {
  const value = (name || '').trim();
  if (!value) return '?';
  return value.slice(0, 1).toUpperCase();
}

export default function ServerList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { removeVPS, setVPSList } = useVPSStore(); // keeping store sync for now, though React Query replaces most of it
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });

  // Data Fetching with React Query
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['vps', pagination.current, search, statusFilter],
    queryFn: async () => {
      const res = await vpsApi.list({
        page: pagination.current,
        pageSize: pagination.pageSize,
        search: search || undefined,
        status: statusFilter || undefined,
      });
      return res.data;
    },
    placeholderData: (previousData) => previousData, // Keep data while fetching new page
  });

  // Sync with legacy store
  useEffect(() => {
    if (data?.items) {
      setVPSList(data.items as VpsListItem[]); 
    }
  }, [data, setVPSList]);

  // Mutation for delete
  const deleteMutation = useMutation({
    mutationFn: (id: number) => vpsApi.delete(id),
    onSuccess: (_, id) => {
      removeVPS(id); // Sync legacy store
      queryClient.invalidateQueries({ queryKey: ['vps'] });
    },
  });

  const handleDelete = (id: number) => {
    if (window.confirm('确定删除这台服务器吗？')) {
      deleteMutation.mutate(id);
    }
  };

  const vpsList = data?.items || [];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="relative w-64">
            <SearchOutlined className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              placeholder="搜索名称或IP"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <select 
            className="h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">所有状态</option>
            <option value="online">在线</option>
            <option value="offline">离线</option>
            <option value="pending">待安装</option>
          </select>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => queryClient.invalidateQueries({ queryKey: ['vps'] })}
            disabled={isFetching}
          >
            <ReloadOutlined className={isFetching ? "animate-spin" : ""} />
            <span className="ml-2">刷新</span>
          </Button>
        </div>

        <Button onClick={() => navigate('/servers/add')}>
          <PlusOutlined className="mr-2" />
          添加服务器
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>系统</TableHead>
              <TableHead>到期时间</TableHead>
              <TableHead>标签</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  加载中...
                </TableCell>
              </TableRow>
            ) : vpsList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-slate-500 dark:text-slate-400">
                  暂无数据
                </TableCell>
              </TableRow>
            ) : (
              vpsList.map((server: VpsListItem) => (
                <TableRow key={server.id}>
                  <TableCell>
                    <div className="flex items-center space-x-3">
                      {server.logo ? (
                        <img
                          src={server.logo}
                          alt=""
                          className="h-6 w-auto max-w-[28px] rounded"
                        />
                      ) : (
                        <div className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          {nameInitial(server.name)}
                        </div>
                      )}
                      <span 
                        className="cursor-pointer font-medium hover:text-blue-600 hover:underline dark:text-slate-200 dark:hover:text-blue-400"
                        onClick={() => navigate(`/servers/${server.id}`)}
                      >
                        {server.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-1">
                      <CountryFlag countryCode={server.countryCode} size="sm" />
                      <span>
                        {server.publicIpv4 || server.ip}
                        {server.publicIpv6 && <span className="text-slate-400">/{server.publicIpv6}</span>}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const s = statusMap[server.agentStatus || ''] || { text: server.agentStatus, variant: 'secondary' };
                      return <Badge variant={s.variant}>{s.text}</Badge>;
                    })()}
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400">
                    {server.osType ? `${server.osType} ${server.osVersion || ''}` : '-'}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      if (!server.billing?.expireDate) return <span className="text-slate-400">-</span>;
                      const expire = dayjs(server.billing.expireDate);
                      const isExpiringSoon = expire.diff(dayjs(), 'day') <= 7;
                      return (
                        <span className={cn(isExpiringSoon ? "text-red-500" : "text-slate-600 dark:text-slate-400")}>
                          {expire.format('YYYY-MM-DD')}
                        </span>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {server.tags?.map((tag) => (
                        <Badge key={tag.id} variant="outline" className="border-slate-200 bg-slate-50 font-normal dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                     <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => navigate(`/servers/${server.id}`)}
                        >
                          详情
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                          onClick={() => handleDelete(server.id)}
                        >
                          <DeleteOutlined />
                        </Button>
                     </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      
      {/* Pagination (Simple implementation) */}
      <div className="flex items-center justify-end space-x-2 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPagination(p => ({ ...p, current: Math.max(1, p.current - 1) }))}
          disabled={pagination.current === 1 || isLoading}
        >
          上一页
        </Button>
        <span className="text-sm text-slate-600 dark:text-slate-400">
          第 {pagination.current} 页
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPagination(p => ({ ...p, current: p.current + 1 }))}
          disabled={vpsList.length < pagination.pageSize || isLoading}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}