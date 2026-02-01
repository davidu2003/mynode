import { useState } from 'react';
import { Layout as AntLayout, Menu, Avatar, Dropdown, Button } from 'antd';
import {
  DashboardOutlined,
  CloudServerOutlined,
  SettingOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BulbOutlined,
  BulbFilled,
  UnorderedListOutlined,
  AppstoreOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore, useThemeStore } from '../stores';
import { authApi } from '../api';

const { Header, Sider, Content } = AntLayout;

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { username, logout } = useAuthStore();
  const { isDark, toggleTheme } = useThemeStore();

  const handleLogout = async () => {
    await authApi.logout();
    logout();
    navigate('/login');
  };

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: '仪表盘',
    },
    {
      key: '/servers',
      icon: <CloudServerOutlined />,
      label: '服务器管理',
      children: [
        {
          key: '/servers/list',
          icon: <UnorderedListOutlined />,
          label: '服务器列表',
        },
        {
          key: '/servers/groups',
          icon: <AppstoreOutlined />,
          label: '分组管理',
        },
        {
          key: '/servers/tags',
          icon: <AppstoreOutlined />,
          label: '标签管理',
        },
      ],
    },
    {
      key: '/configs',
      icon: <SettingOutlined />,
      label: '配置管理',
    },
    {
      key: '/software',
      icon: <ToolOutlined />,
      label: '软件管理',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '系统设置',
    },
  ];

  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ];

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        style={{
          borderRight: '1px solid var(--ant-color-border)',
          backgroundColor: isDark ? '#141414' : '#fff',
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid var(--ant-color-border)',
          }}
        >
          <h1 style={{
            fontSize: collapsed ? 16 : 20,
            fontWeight: 600,
            color: '#1890ff',
            margin: 0,
          }}>
            {collapsed ? 'M' : 'Mynode'}
          </h1>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          defaultOpenKeys={['/servers']}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <AntLayout>
        <Header
          style={{
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--ant-color-border)',
            backgroundColor: isDark ? '#141414' : '#fff',
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button
              type="text"
              icon={isDark ? <BulbFilled /> : <BulbOutlined />}
              onClick={toggleTheme}
              title={isDark ? '切换到浅色模式' : '切换到深色模式'}
            />
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar style={{ backgroundColor: '#1890ff' }}>
                  {username?.charAt(0).toUpperCase()}
              </Avatar>
              <span>{username}</span>
            </div>
          </Dropdown>
          </div>
        </Header>
        <Content
          style={{
            margin: 24,
            padding: 24,
            borderRadius: 8,
            minHeight: 280,
            backgroundColor: isDark ? '#141414' : '#fff',
          }}
        >
          {children}
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
