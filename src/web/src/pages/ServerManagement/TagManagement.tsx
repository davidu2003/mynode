import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { message } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { LuTags, LuTag } from "react-icons/lu";
import { systemApi } from '../../api';
import { getErrorMessage } from '../../utils/api-error';

import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';

type TagItem = { id: number; name: string; color?: string | null };

export default function TagManagement() {
  const [tags, setTags] = useState<TagItem[]>([]);

  // Create Form
  const { register: registerCreate, handleSubmit: handleSubmitCreate, reset: resetCreate } = useForm<{ name: string; color: string }>();

  // Edit State
  const [editingTag, setEditingTag] = useState<TagItem | null>(null);
  const { register: registerEdit, handleSubmit: handleSubmitEdit, setValue: setValueEdit } = useForm<{ name: string; color: string }>();

  const fetchTags = async () => {
    try {
      const res = await systemApi.tags();
      setTags(res.data.items || []);
    } catch {
      message.error('获取标签失败');
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  const onCreate = async (values: { name: string; color: string }) => {
    try {
      await systemApi.createTag(values);
      message.success('标签已创建');
      resetCreate();
      fetchTags();
    } catch (err) {
      message.error(getErrorMessage(err, '创建失败'));
    }
  };

  const onEditOpen = (tag: TagItem) => {
    setEditingTag(tag);
    setValueEdit('name', tag.name);
    setValueEdit('color', tag.color || '#1890ff');
  };

  const onEditSubmit = async (values: { name: string; color: string }) => {
    if (!editingTag) return;
    try {
      await systemApi.updateTag(editingTag.id, values);
      message.success('标签已更新');
      setEditingTag(null);
      fetchTags();
    } catch (err) {
      message.error(getErrorMessage(err, '更新失败'));
    }
  };

  const onDelete = async (id: number) => {
    if (!window.confirm('确定删除该标签吗？')) return;
    try {
      await systemApi.deleteTag(id);
      message.success('标签已删除');
      fetchTags();
    } catch (err) {
      message.error(getErrorMessage(err, '删除失败'));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LuTag className="h-4 w-4" />
            新增标签
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmitCreate(onCreate)} className="flex flex-col md:flex-row gap-4 items-end">
            <div className="w-full md:w-1/3 space-y-2">
              <Label htmlFor="create-name">名称</Label>
              <Input id="create-name" {...registerCreate('name', { required: true })} placeholder="标签名称" />
            </div>
            <div className="w-full md:w-auto space-y-2">
              <Label htmlFor="create-color">颜色</Label>
              <div className="flex gap-2">
                 <Input 
                   id="create-color" 
                   type="color" 
                   {...registerCreate('color')} 
                   className="w-16 h-9 p-1 cursor-pointer" 
                   defaultValue="#1890ff"
                 />
              </div>
            </div>
            <Button type="submit" className="w-full md:w-auto">创建</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LuTags className="h-4 w-4" />
            标签列表
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>颜色值</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tags.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-slate-500">暂无标签</TableCell></TableRow>
              ) : (
                tags.map(tag => (
                  <TableRow key={tag.id}>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        style={{ backgroundColor: `${tag.color}20`, borderColor: tag.color || '#ccc', color: tag.color || '#333' }}
                      >
                        {tag.name}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">{tag.color}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="ghost" size="sm" onClick={() => onEditOpen(tag)}>
                        <EditOutlined />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20" onClick={() => onDelete(tag.id)}>
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
      <Dialog open={!!editingTag} onOpenChange={(open) => !open && setEditingTag(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑标签</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmitEdit(onEditSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input {...registerEdit('name', { required: true })} />
            </div>
            <div className="space-y-2">
              <Label>颜色</Label>
              <Input type="color" {...registerEdit('color')} className="w-full h-10 p-1 cursor-pointer" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingTag(null)}>取消</Button>
              <Button type="submit">保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
