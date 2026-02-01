import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { LoadingOutlined } from '@ant-design/icons';
import { useAuthStore } from './stores';
import { authApi } from './api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Setup from './pages/Login/Setup';
import Dashboard from './pages/Dashboard';
import ServerList from './pages/ServerManagement/List';
import ServerDetail from './pages/ServerManagement/Detail';
import ServerAdd from './pages/ServerManagement/Add';
import GroupManagement from './pages/ServerManagement/GroupManagement';
import TagManagement from './pages/ServerManagement/TagManagement';
import ConfigManagement from './pages/ConfigManagement';
import NetworkConfig from './pages/ConfigManagement/Network';
import TimezoneConfig from './pages/ConfigManagement/Timezone';
import DnsConfig from './pages/ConfigManagement/Dns';
import SshConfig from './pages/ConfigManagement/Ssh';
import SoftwareManagement from './pages/SoftwareManagement';
import SoftwareForm from './pages/SoftwareManagement/Form';
import Settings from './pages/Settings';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

// 包装组件：通过 key 强制在 ID 变化时重新挂载 ServerDetail
function ServerDetailWrapper() {
  const { id } = useParams<{ id: string }>();
  return <ServerDetail key={id} />;
}

function App() {
  const [loading, setLoading] = useState(true);
  const { setAuth, setInitialized, initialized } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // 检查是否需要初始化
        const statusRes = await authApi.status();
        if (!statusRes.data.initialized) {
          setInitialized(false);
          setLoading(false);
          navigate('/setup');
          return;
        }

        // 检查登录状态
        const meRes = await authApi.me();
        if (meRes.data.authenticated) {
          setAuth(true, meRes.data.username);
        }
      } catch {
        // 未登录
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [navigate, setAuth, setInitialized]); // Added dependencies

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <LoadingOutlined style={{ fontSize: 40, color: '#1890ff' }} />
      </div>
    );
  }

  if (!initialized) {
    return (
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route path="*" element={<Navigate to="/setup" />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />

                {/* 服务器管理 */}
                <Route path="/servers" element={<Navigate to="/servers/list" />} />
                <Route path="/servers/list" element={<ServerList />} />
                <Route path="/servers/groups" element={<GroupManagement />} />
                <Route path="/servers/tags" element={<TagManagement />} />
                <Route path="/servers/add" element={<ServerAdd />} />
                <Route path="/servers/:id/edit" element={<ServerAdd />} />
                <Route path="/servers/:id" element={<ServerDetailWrapper />} />

                {/* 配置管理 */}
                <Route path="/configs" element={<ConfigManagement />} />
                <Route path="/configs/network" element={<NetworkConfig />} />
                <Route path="/configs/timezone" element={<TimezoneConfig />} />
                <Route path="/configs/dns" element={<DnsConfig />} />
                <Route path="/configs/ssh" element={<SshConfig />} />
                <Route path="/servers/configs" element={<Navigate to="/configs" replace />} />

                {/* 软件管理 */}
                <Route path="/software" element={<SoftwareManagement />} />
                <Route path="/software/create" element={<SoftwareForm />} />
                <Route path="/software/:id" element={<SoftwareForm />} />
                <Route path="/servers/software" element={<Navigate to="/software" replace />} />
                <Route path="/servers/software/create" element={<Navigate to="/software/create" replace />} />
                <Route path="/servers/software/:id" element={<Navigate to="/software/:id" replace />} />

                {/* 兼容旧路由 - 重定向 */}
                <Route path="/vps" element={<Navigate to="/servers/list" replace />} />
                <Route path="/vps/add" element={<Navigate to="/servers/add" replace />} />
                <Route path="/vps/:id" element={<Navigate to="/servers/:id" replace />} />

                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </Layout>
          </PrivateRoute>
        }
      />
    </Routes>
  );
}

export default App;
