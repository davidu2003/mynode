import { useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
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
import { useAuthStore, useThemeStore } from '../stores';
import { authApi } from '../api';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

interface NavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  {
    title: '仪表盘',
    href: '/',
    icon: <DashboardOutlined />,
  },
  {
    title: '服务器管理',
    href: '/servers',
    icon: <CloudServerOutlined />,
    children: [
      {
        title: '服务器列表',
        href: '/servers/list',
        icon: <UnorderedListOutlined />,
      },
      {
        title: '分组管理',
        href: '/servers/groups',
        icon: <AppstoreOutlined />,
      },
      {
        title: '标签管理',
        href: '/servers/tags',
        icon: <AppstoreOutlined />,
      },
    ],
  },
  {
    title: '配置管理',
    href: '/configs',
    icon: <SettingOutlined />,
  },
  {
    title: '软件管理',
    href: '/software',
    icon: <ToolOutlined />,
  },
  {
    title: '系统设置',
    href: '/settings',
    icon: <SettingOutlined />,
  },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { username, logout } = useAuthStore();
  const { isDark, toggleTheme } = useThemeStore();
  const [openGroups, setOpenGroups] = useState<string[]>(['/servers']);

  const handleLogout = async () => {
    await authApi.logout();
    logout();
    navigate('/login');
  };

  const toggleGroup = (href: string) => {
    setOpenGroups(prev => 
      prev.includes(href) ? prev.filter(p => p !== href) : [...prev, href]
    );
  };

  return (
    <div className={cn("min-h-screen flex", isDark ? "dark bg-slate-950 text-slate-50" : "bg-slate-50 text-slate-900")}>
      {/* Sidebar */}
      <aside 
        className={cn(
          "bg-white border-r border-slate-200 transition-all duration-300 flex flex-col z-20",
          collapsed ? "w-16" : "w-64",
          isDark && "bg-slate-900 border-slate-800"
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-center border-b border-slate-200 dark:border-slate-800">
           <h1 className="text-xl font-bold text-blue-600 truncate px-4">
             {collapsed ? 'M' : 'Mynode'}
           </h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
            const hasChildren = item.children && item.children.length > 0;
            const isOpen = openGroups.includes(item.href);

            if (collapsed) {
              return (
                <div key={item.href} className="group relative flex justify-center py-2" onClick={() => !hasChildren && navigate(item.href)}>
                  <div className={cn(
                    "p-2 rounded-md cursor-pointer transition-colors hover:bg-slate-100 dark:hover:bg-slate-800",
                    isActive && "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                  )}>
                    {item.icon}
                  </div>
                </div>
              );
            }

            return (
              <div key={item.href}>
                <div 
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors text-sm font-medium",
                    isActive && !hasChildren ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400" : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                  onClick={() => {
                    if (hasChildren) {
                      toggleGroup(item.href);
                    } else {
                      navigate(item.href);
                    }
                  }}
                >
                  <div className="flex items-center gap-3">
                    {item.icon}
                    <span>{item.title}</span>
                  </div>
                  {hasChildren && (
                    <span className="text-xs text-slate-400">
                      {isOpen ? '▼' : '▶'}
                    </span>
                  )}
                </div>

                {hasChildren && isOpen && (
                  <div className="mt-1 ml-4 space-y-1 border-l-2 border-slate-100 dark:border-slate-800 pl-2">
                    {item.children!.map(child => {
                      const isChildActive = location.pathname === child.href;
                      return (
                        <div
                          key={child.href}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors text-sm",
                            isChildActive ? "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/10" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                          )}
                          onClick={() => navigate(child.href)}
                        >
                          {child.icon}
                          <span>{child.title}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer Actions */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
          {!collapsed && (
            <div className="flex items-center gap-3 px-3 py-2 text-sm text-slate-600 dark:text-slate-400">
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                 {username?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 truncate">
                <p className="font-medium text-slate-900 dark:text-slate-200">{username}</p>
              </div>
            </div>
          )}
          <Button 
             variant="ghost" 
             className={cn("w-full justify-start", collapsed && "justify-center px-0")}
             onClick={handleLogout}
          >
            <LogoutOutlined />
            {!collapsed && <span className="ml-2">退出登录</span>}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950">
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 sticky top-0 z-10">
          <Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)}>
             {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </Button>

          <div className="flex items-center gap-4">
             <Button variant="ghost" size="icon" onClick={toggleTheme}>
               {isDark ? <BulbFilled className="text-yellow-400" /> : <BulbOutlined />}
             </Button>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
