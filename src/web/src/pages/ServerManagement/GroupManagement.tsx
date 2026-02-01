import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { message } from 'antd'; // Keeping AntD message for simplicity
import { EditOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons';
import { LuFolderPlus, LuFolders } from "react-icons/lu";
import { systemApi, vpsApi } from '../../api';
import { getErrorMessage } from '../../utils/api-error';

import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';

type GroupItem = { id: number; name: string; description?: string | null };
type ServerItem = { id: number; name: string; agentStatus: string };

export default function GroupManagement() {
  const [groups, setGroups] = useState<GroupItem[]>([]);
  
  // Create Form
  const { register: registerCreate, handleSubmit: handleSubmitCreate, reset: resetCreate } = useForm<{ name: string; description: string }>();

  // Edit State
  const [editingGroup, setEditingGroup] = useState<GroupItem | null>(null);
  const { register: registerEdit, handleSubmit: handleSubmitEdit, setValue: setValueEdit } = useForm<{ name: string; description: string }>();

  // Manage Servers State
  const [manageGroup, setManageGroup] = useState<GroupItem | null>(null);
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [selectedServerIds, setSelectedServerIds] = useState<number[]>([]);
  const [serversLoading, setServersLoading] = useState(false);

  const fetchGroups = async () => {
    try {
      const res = await systemApi.groups();
      setGroups(res.data.items || []);
    } catch {
      message.error('获取分组失败');
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  // Handlers
  const onCreate = async (values: { name: string; description: string }) => {
    try {
      await systemApi.createGroup(values);
      message.success('分组已创建');
      resetCreate();
      fetchGroups();
    } catch (err) {
      message.error(getErrorMessage(err, '创建失败'));
    }
  };

  const onEditOpen = (group: GroupItem) => {
    setEditingGroup(group);
    setValueEdit('name', group.name);
    setValueEdit('description', group.description || '');
  };

  const onEditSubmit = async (values: { name: string; description: string }) => {
    if (!editingGroup) return;
    try {
      await systemApi.updateGroup(editingGroup.id, values);
      message.success('分组已更新');
      setEditingGroup(null);
      fetchGroups();
    } catch (err) {
      message.error(getErrorMessage(err, '更新失败'));
    }
  };

  const onDelete = async (id: number) => {
    if (!window.confirm('确定删除该分组吗？')) return;
    try {
      await systemApi.deleteGroup(id);
      message.success('分组已删除');
      fetchGroups();
    } catch (err) {
      message.error(getErrorMessage(err, '删除失败'));
    }
  };

  const onManageOpen = async (group: GroupItem) => {
    setManageGroup(group);
    setServersLoading(true);
    try {
      // Fetch all servers and group's servers
      const [allRes, groupRes] = await Promise.all([
        vpsApi.list({ page: 1, pageSize: 500 }), // Assume 500 is enough for now
        systemApi.groupVps(group.id),
      ]);
      
      const allServers = (allRes.data.items || []).map((s: any) => ({ id: s.id, name: s.name, agentStatus: s.agentStatus }));
      const groupServers = (groupRes.data.items || []).map((s: any) => s.id);
      
      setServers(allServers);
      setSelectedServerIds(groupServers);
    } catch {
      message.error('获取服务器数据失败');
    } finally {
      setServersLoading(false);
    }
  };

  const onManageSave = async () => {
    if (!manageGroup) return;
    try {
      await systemApi.updateGroupVps(manageGroup.id, selectedServerIds);
      message.success('分组服务器已更新');
      setManageGroup(null);
    } catch (err) {
      message.error(getErrorMessage(err, '更新失败'));
    }
  };

  const toggleServerSelection = (id: number) => {
    setSelectedServerIds(prev => 
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LuFolderPlus className="h-4 w-4" />
            新增分组
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmitCreate(onCreate)} className="flex flex-col md:flex-row gap-4 items-end">
            <div className="w-full md:w-1/3 space-y-2">
              <Label htmlFor="create-name">名称</Label>
              <Input id="create-name" {...registerCreate('name', { required: true })} placeholder="分组名称" />
            </div>
            <div className="w-full md:w-1/2 space-y-2">
              <Label htmlFor="create-desc">描述</Label>
              <Input id="create-desc" {...registerCreate('description')} placeholder="可选描述" />
            </div>
            <Button type="submit" className="w-full md:w-auto">创建</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LuFolders className="h-4 w-4" />
            分组列表
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>描述</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-slate-500">暂无分组</TableCell></TableRow>
              ) : (
                groups.map(group => (
                  <TableRow key={group.id}>
                    <TableCell className="font-medium">{group.name}</TableCell>
                    <TableCell className="text-slate-500">{group.description || '-'}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="sm" onClick={() => onManageOpen(group)}>
                        <SettingOutlined className="mr-2" /> 服务器
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onEditOpen(group)}>
                        <EditOutlined />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20" onClick={() => onDelete(group.id)}>
                        <DeleteOutlined />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingGroup} onOpenChange={(open) => !open && setEditingGroup(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑分组</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmitEdit(onEditSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input {...registerEdit('name', { required: true })} />
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Input {...registerEdit('description')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingGroup(null)}>取消</Button>
              <Button type="submit">保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manage Servers Dialog */}
      <Dialog open={!!manageGroup} onOpenChange={(open) => !open && setManageGroup(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>管理服务器 - {manageGroup?.name}</DialogTitle></DialogHeader>
          
          <div className="space-y-4">
             <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">已选: {selectedServerIds.length}</span>
                <div className="space-x-2">
                   <Button size="sm" variant="outline" onClick={() => setSelectedServerIds(servers.map(s => s.id))}>全选</Button>
                   <Button size="sm" variant="outline" onClick={() => setSelectedServerIds([])}>清空</Button>
                </div>
             </div>

             <div className="max-h-[400px] overflow-y-auto border border-slate-200 rounded-md p-2 dark:border-slate-800">
                {serversLoading ? (
                  <div className="text-center py-8 text-slate-500">加载中...</div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {servers.map(server => {
                      const isSelected = selectedServerIds.includes(server.id);
                      return (
                        <div 
                          key={server.id}
                          className={`
                            cursor-pointer p-3 rounded-md border flex items-center justify-between transition-colors
                            ${isSelected 
                              ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' 
                              : 'bg-white border-slate-100 hover:border-slate-300 dark:bg-slate-950 dark:border-slate-800 dark:hover:border-slate-700'}
                          `}
                          onClick={() => toggleServerSelection(server.id)}
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                             <span className="truncate font-medium text-sm">{server.name}</span>
                          </div>
                          <Badge variant={server.agentStatus === 'online' ? 'success' : 'secondary'} className="text-[10px] px-1.5 h-5">
                            {server.agentStatus}
                          </Badge>
                        </div>
                      );
                    })}
                    {servers.length === 0 && <div className="col-span-2 text-center py-4 text-slate-500">无可用服务器</div>}
                  </div>
                )}
             </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setManageGroup(null)}>取消</Button>
            <Button onClick={onManageSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
