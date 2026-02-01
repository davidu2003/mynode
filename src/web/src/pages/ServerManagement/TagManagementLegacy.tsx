import { useEffect, useState } from 'react';
import { Button, Card, Form, Input, Modal, Popconfirm, Space, Table, Tag, message } from 'antd';
import { systemApi } from '../../api';
import { getErrorMessage } from '../../utils/api-error';

export default function TagManagement() {
  const [tags, setTags] = useState<{ id: number; name: string; color?: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [editing, setEditing] = useState<{ id: number; name: string; color?: string | null } | null>(null);

  const fetchTags = async () => {
    setLoading(true);
    try {
      const res = await systemApi.tags();
      setTags(res.data.items || []);
    } catch (err) {
      message.error('获取标签失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  const handleCreate = async (values: { name: string; color?: string }) => {
    try {
      await systemApi.createTag(values);
      message.success('标签已创建');
      form.resetFields();
      fetchTags();
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '创建失败'));
    }
  };

  const handleUpdate = async () => {
    const values = await editForm.validateFields();
    if (!editing) return;
    try {
      await systemApi.updateTag(editing.id, values);
      message.success('标签已更新');
      setEditing(null);
      fetchTags();
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '更新失败'));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await systemApi.deleteTag(id);
      message.success('标签已删除');
      fetchTags();
    } catch (err: unknown) {
      message.error(getErrorMessage(err, '删除失败'));
    }
  };

  return (
    <div>
      <Card title="新增标签" style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline" onFinish={handleCreate}>
          <Form.Item name="name" rules={[{ required: true, message: '请输入标签名称' }]}>
            <Input placeholder="标签名称" />
          </Form.Item>
          <Form.Item name="color" initialValue="#1890ff">
            <Input type="color" style={{ width: 80 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">创建</Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="标签列表">
        <Table
          rowKey="id"
          dataSource={tags}
          loading={loading}
          pagination={false}
          columns={[
            { title: '名称', dataIndex: 'name', render: (name, record) => <Tag color={record.color || '#1890ff'}>{name}</Tag> },
            { title: '颜色', dataIndex: 'color', render: (value) => value || '#1890ff' },
            {
              title: '操作',
              render: (_: unknown, record: { id: number; name: string; color?: string | null }) => (
                <Space>
                  <Button
                    size="small"
                    onClick={() => {
                      setEditing(record);
                      editForm.setFieldsValue({
                        name: record.name,
                        color: record.color || '#1890ff',
                      });
                    }}
                  >
                    编辑
                  </Button>
                  <Popconfirm
                    title="确定删除该标签吗？"
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
        title="编辑标签"
        onCancel={() => setEditing(null)}
        onOk={handleUpdate}
        okText="保存"
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入标签名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="color" label="颜色">
            <Input type="color" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
