import { useEffect, useState } from 'react';
import { Table, Button, Tag, Space, Input, Select, message, Popconfirm } from 'antd';
import { PlusOutlined, SearchOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { vpsApi, systemApi } from '../../api';
import { useVPSStore } from '../../stores';
import dayjs from 'dayjs';

const statusMap: Record<string, { text: string; color: string }> = {
  online: { text: '在线', color: 'success' },
  offline: { text: '离线', color: 'error' },
  pending: { text: '待安装', color: 'warning' },
  installing: { text: '安装中', color: 'processing' },
};

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
  billing?: VpsBilling;
  tags?: VpsTag[];
};

function nameInitial(name?: string): string {
  const value = (name || '').trim();
  if (!value) return '?';
  return value.slice(0, 1).toUpperCase();
}

export default function ServerList() {
  const navigate = useNavigate();
  const { vpsList, setVPSList, loading, setLoading, removeVPS } = useVPSStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  const fetchVPSList = async (page = 1) => {
    setLoading(true);
    try {
      const res = await vpsApi.list({
        page,
        pageSize: pagination.pageSize,
        search: search || undefined,
        status: statusFilter || undefined,
      });
      setVPSList(res.data.items);
      setPagination({ ...pagination, current: page, total: res.data.total });
    } catch (err) {
      message.error('获取服务器列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await systemApi.groups();
      setGroups(res.data.items);
    } catch (err) {
      console.error('Failed to fetch groups:', err);
    }
  };

  useEffect(() => {
    fetchVPSList();
    fetchGroups();
  }, []);

  const handleDelete = async (id: number) => {
    try {
      await vpsApi.delete(id);
      removeVPS(id);
      message.success('删除成功');
    } catch (err) {
      message.error('删除失败');
    }
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: VpsListItem) => (
        <Space align="center">
          {record.logo ? (
            <img
              src={record.logo}
              alt=""
              style={{ height: 20, width: 'auto', maxWidth: 28, borderRadius: 6, display: 'block' }}
            />
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 20,
                height: 20,
                borderRadius: 6,
                background: '#f1f2f4',
                color: '#666',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {nameInitial(name)}
            </span>
          )}
          <a onClick={() => navigate(`/servers/${record.id}`)}>{name}</a>
        </Space>
      ),
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      key: 'ip',
      render: (ip: string, record: VpsListItem) => `${ip}:${record.sshPort}`,
    },
    {
      title: '状态',
      dataIndex: 'agentStatus',
      key: 'agentStatus',
      render: (status: string) => {
        const s = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '系统',
      key: 'os',
      render: (_: unknown, record: VpsListItem) =>
        record.osType ? `${record.osType} ${record.osVersion || ''}` : '-',
    },
    {
      title: '到期时间',
      key: 'expireDate',
      render: (_: unknown, record: VpsListItem) => {
        if (!record.billing?.expireDate) return '-';
        const expire = dayjs(record.billing.expireDate);
        const isExpiringSoon = expire.diff(dayjs(), 'day') <= 7;
        return (
          <span style={{ color: isExpiringSoon ? '#ff4d4f' : undefined }}>
            {expire.format('YYYY-MM-DD')}
          </span>
        );
      },
    },
    {
      title: '标签',
      key: 'tags',
      render: (_: unknown, record: VpsListItem) =>
        record.tags?.map((tag: VpsTag) => (
          <Tag key={tag.id} color={tag.color}>
            {tag.name}
          </Tag>
        )),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: VpsListItem) => (
        <Space>
          <Button size="small" onClick={() => navigate(`/servers/${record.id}`)}>
            详情
          </Button>
          <Popconfirm
            title="确定删除这台服务器吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Input
            placeholder="搜索名称或IP"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={() => fetchVPSList(1)}
            style={{ width: 200 }}
          />
          <Select
            placeholder="状态筛选"
            allowClear
            value={statusFilter || undefined}
            onChange={(v) => setStatusFilter(v || '')}
            style={{ width: 120 }}
            options={[
              { value: 'online', label: '在线' },
              { value: 'offline', label: '离线' },
              { value: 'pending', label: '待安装' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={() => fetchVPSList(pagination.current)}>
            刷新
          </Button>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/servers/add')}>
          添加服务器
        </Button>
      </div>
      <Table
        columns={columns}
        dataSource={vpsList}
        rowKey="id"
        loading={loading}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
          onChange: (page) => fetchVPSList(page),
        }}
      />
    </div>
  );
}
