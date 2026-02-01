import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { authApi } from '../../api';
import { useAuthStore } from '../../stores';
import { getErrorMessage } from '../../utils/api-error';

// UI Components
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card';
import { Label } from '../../components/ui/label';

interface SetupFormValues {
  username: string;
  password: string;
  confirmPassword: string;
}

export default function Setup() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { setInitialized, setAuth } = useAuthStore();

  const { register, handleSubmit, formState: { errors } } = useForm<SetupFormValues>();

  const onSubmit = async (values: SetupFormValues) => {
    if (values.password !== values.confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      await authApi.setup({ username: values.username, password: values.password });
      setInitialized(true);

      // Auto login
      const res = await authApi.login({ username: values.username, password: values.password });
      setAuth(true, res.data.username);
      navigate('/');
    } catch (err: unknown) {
      setError(getErrorMessage(err, '创建失败'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-purple-700 p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-3xl text-blue-600">Mynode</CardTitle>
          <CardDescription className="text-base">初始化 - 创建管理员账号</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {error && (
              <div className="bg-red-50 text-red-500 text-sm p-3 rounded-md border border-red-100">
                {error}
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <div className="relative">
                <UserOutlined className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  id="username"
                  {...register('username', { required: true, minLength: 3 })}
                  placeholder="用户名 (至少3位)"
                  className="pl-9"
                  disabled={loading}
                />
              </div>
              {errors.username && <span className="text-xs text-red-500">请输入有效的用户名</span>}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <div className="relative">
                <LockOutlined className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  id="password"
                  type="password"
                  {...register('password', { required: true, minLength: 8 })}
                  placeholder="密码 (至少8位)"
                  className="pl-9"
                  disabled={loading}
                />
              </div>
              {errors.password && <span className="text-xs text-red-500">请输入有效的密码 (至少8位)</span>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认密码</Label>
              <div className="relative">
                <LockOutlined className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  id="confirmPassword"
                  type="password"
                  {...register('confirmPassword', { required: true })}
                  placeholder="确认密码"
                  className="pl-9"
                  disabled={loading}
                />
              </div>
              {errors.confirmPassword && <span className="text-xs text-red-500">请确认密码</span>}
            </div>
            
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '创建中...' : '创建管理员账号'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
