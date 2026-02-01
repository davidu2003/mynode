import { useNavigate } from 'react-router-dom';
import { LuNetwork, LuClock, LuGlobe, LuShield, LuLock, LuUsers } from "react-icons/lu";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';

const modules = [
  {
    key: 'network',
    title: '网络配置',
    icon: LuNetwork,
    description: 'BBR + FQ、自定义sysctl、IPv6禁用、IPv4优先',
    path: '/configs/network',
    status: '已开放',
    disabled: false,
  },
  {
    key: 'timezone',
    title: '时区配置',
    icon: LuClock,
    description: '设置系统时区并同步到服务器',
    path: '/configs/timezone',
    status: '已开放',
    disabled: false,
  },
  {
    key: 'dns',
    title: 'DNS配置',
    icon: LuGlobe,
    description: '设置DNS解析与优先级',
    path: '/configs/dns',
    status: '已开放',
    disabled: false,
  },
  {
    key: 'nftables',
    title: 'nftables配置',
    icon: LuShield,
    description: '防火墙规则管理与同步',
    path: '/configs/nftables',
    status: '待实现',
    disabled: true,
  },
  {
    key: 'ssh',
    title: 'SSH配置',
    icon: LuLock,
    description: 'SSH端口与安全策略',
    path: '/configs/ssh',
    status: '已开放',
    disabled: false,
  },
  {
    key: 'users',
    title: '用户配置',
    icon: LuUsers,
    description: '用户与权限管理',
    path: '/configs/users',
    status: '待实现',
    disabled: true,
  },
];

export default function ConfigManagement() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">配置管理</h2>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {modules.map((item) => (
          <Card key={item.key} className={item.disabled ? 'opacity-60' : ''}>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg flex items-center gap-2">
                  <item.icon className="h-5 w-5" />
                  {item.title}
                </CardTitle>
                <Badge variant={item.disabled ? 'secondary' : 'success'}>{item.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <CardDescription className="min-h-[40px]">{item.description}</CardDescription>
              <Button
                className="w-full"
                disabled={item.disabled}
                onClick={() => navigate(item.path)}
              >
                进入配置
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
