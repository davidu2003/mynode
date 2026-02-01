import { Card, Button, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';

const modules = [
  {
    key: 'network',
    title: '网络配置',
    description: 'BBR + FQ、自定义sysctl、IPv6禁用、IPv4优先',
    path: '/configs/network',
    status: '已开放',
    disabled: false,
  },
  {
    key: 'timezone',
    title: '时区配置',
    description: '设置系统时区并同步到服务器',
    path: '/configs/timezone',
    status: '已开放',
    disabled: false,
  },
  {
    key: 'dns',
    title: 'DNS配置',
    description: '设置DNS解析与优先级',
    path: '/configs/dns',
    status: '已开放',
    disabled: false,
  },
  {
    key: 'nftables',
    title: 'nftables配置',
    description: '防火墙规则管理与同步',
    path: '/configs/nftables',
    status: '待实现',
    disabled: true,
  },
  {
    key: 'ssh',
    title: 'SSH配置',
    description: 'SSH端口与安全策略',
    path: '/configs/ssh',
    status: '已开放',
    disabled: false,
  },
  {
    key: 'users',
    title: '用户配置',
    description: '用户与权限管理',
    path: '/configs/users',
    status: '待实现',
    disabled: true,
  },
];

export default function ConfigManagement() {
  const navigate = useNavigate();

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>配置管理</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {modules.map((item) => (
          <Card
            key={item.key}
            title={item.title}
            extra={<Tag color={item.disabled ? 'default' : 'green'}>{item.status}</Tag>}
          >
            <p style={{ color: '#666', minHeight: 44 }}>{item.description}</p>
            <Button
              type="primary"
              disabled={item.disabled}
              onClick={() => navigate(item.path)}
            >
              进入配置
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
