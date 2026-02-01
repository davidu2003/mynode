import { useEffect, useState } from 'react';
import { Button, Card, Form, Input, Modal, Popconfirm, Space, Table, message, Tag } from 'antd';
import { systemApi, vpsApi } from '../../api';
import { getErrorMessage } from '../../utils/api-error';
import ServerSelector from '../../components/ServerSelector';

type GroupItem = { id: number; name: string; description?: string | null };
type ServerItem = { id: number; name: string; agentStatus: string };

export default function GroupManagement() {
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [serversLoading, setServersLoading] = useState(false);
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [groupServers, setGroupServers] = useState<ServerItem[]>([]);
  const [selectedServerIds, setSelectedServerIds] = useState<number[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageGroup, setManageGroup] = useState<{ id: number; name: string } | null>(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [editing, setEditing] = useState<GroupItem | null>(null);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const res = await systemApi.groups();
      setGroups(res.data.items || []);
    } catch (err) {
      message.error('获取分组失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const openManage = async (group: { id: number; name: string }) => {
    setManageGroup(group);
    setManageOpen(true);
    setServersLoading(true);
    try {
      const [serversRes, groupRes] = await Promise.all([
        vpsApi.list({ page: 1, pageSize: 500 }),
        systemApi.groupVps(group.id),
      ]);
      const allServers = (serversRes.data.items || []).map((item: ServerItem) => ({
        id: item.id,
        name: item.name,
        agentStatus: item.agentStatus,
      }));
      const groupItems = (groupRes.data.items || []).map((item: ServerItem) => ({
        id: item.id,
        name: item.name,
        agentStatus: item.agentStatus,
      }));
      setServers(allServers);
      setGroupServers(groupItems);
      setSelectedServerIds(groupItems.map((item: ServerItem) => item.id));
    } catch (err) {
      message.error('获取服务器列表失败');
    } finally {
      setServersLoading(false);
    }
  };

  const handleSaveServers = async () => {
    if (!manageGroup) return;
    try {
      await systemApi.updateGroupVps(manageGroup.id, selectedServerIds);
      message.success('分组服务器已更新');
      setManageOpen(false);
      fetchGroups();
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '更新失败'));
    }
  };

  const handleCreate = async (values: { name: string; description?: string }) => {
    try {
      await systemApi.createGroup(values);
      message.success('分组已创建');
      form.resetFields();
      fetchGroups();
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '创建失败'));
    }
  };

  const handleUpdate = async () => {
    const values = await editForm.validateFields();
    if (!editing) return;
    try {
      await systemApi.updateGroup(editing.id, values);
      message.success('分组已更新');
      setEditing(null);
      fetchGroups();
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '更新失败'));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await systemApi.deleteGroup(id);
      message.success('分组已删除');
      fetchGroups();
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '删除失败'));
    }
  };

  return (
    <div>
      <Card title="新增分组" style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline" onFinish={handleCreate}>
          <Form.Item name="name" rules={[{ required: true, message: '请输入分组名称' }]}>
            <Input placeholder="分组名称" />
          </Form.Item>
          <Form.Item name="description">
            <Input placeholder="描述（可选）" style={{ width: 260 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">创建</Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="分组列表">
        <Table
          rowKey="id"
          dataSource={groups}
          loading={loading}
          pagination={false}
          columns={[
            { title: '名称', dataIndex: 'name' },
            { title: '描述', dataIndex: 'description', render: (value) => value || '-' },
            {
              title: '操作',
              render: (_: unknown, record: GroupItem) => (
                <Space>
                  <Button size="small" onClick={() => openManage(record)}>服务器</Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setEditing(record);
                      editForm.setFieldsValue({
                        name: record.name,
                        description: record.description || '',
                      });
                    }}
                  >
                    编辑
                  </Button>
                  <Popconfirm
                    title="确定删除该分组吗？"
                    onConfirm={() => handleDelete(record.id)}
                    okText="确定"
                    cancelText="取消"
                  >
                    <Button size="small" danger>删除</Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={!!editing}
        title="编辑分组"
        onCancel={() => setEditing(null)}
        onOk={handleUpdate}
        okText="保存"
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入分组名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={manageOpen}
        title={manageGroup ? `管理服务器 - ${manageGroup.name}` : '管理服务器'}
        onCancel={() => setManageOpen(false)}
        onOk={handleSaveServers}
        okText="保存"
        width={720}
      >
        <Card size="small" title="分组服务器" style={{ marginBottom: 12 }}>
          <Table
            rowKey="id"
            dataSource={groupServers}
            pagination={false}
            size="small"
            columns={[
              { title: '名称', dataIndex: 'name' },
              {
                title: '状态',
                dataIndex: 'agentStatus',
                render: (value) => {
                  const color = value === 'online' ? 'green' : value === 'offline' ? 'red' : 'default';
                  return <Tag color={color}>{value}</Tag>;
                },
              },
            ]}
          />
        </Card>
        <Card size="small" title="选择服务器">
          <ServerSelector
            servers={servers}
            value={selectedServerIds}
            onChange={setSelectedServerIds}
            placeholder="选择服务器"
            loading={serversLoading}
            includeAllStatuses
          />
        </Card>
      </Modal>
    </div>
  );
}
