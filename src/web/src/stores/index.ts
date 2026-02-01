import { create } from 'zustand';

interface AuthState {
  isAuthenticated: boolean;
  username: string | null;
  initialized: boolean;
  setAuth: (authenticated: boolean, username?: string) => void;
  setInitialized: (initialized: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  username: null,
  initialized: true, // 假设已初始化，后续检查
  setAuth: (authenticated, username) =>
    set({ isAuthenticated: authenticated, username: username || null }),
  setInitialized: (initialized) => set({ initialized }),
  logout: () => set({ isAuthenticated: false, username: null }),
}));

interface VPS {
  id: number;
  name: string;
  ip: string;
  sshPort: number;
  agentStatus: 'pending' | 'installing' | 'online' | 'offline';
  osType?: string;
  osVersion?: string;
  arch?: string;
  logo?: string;
  vendorUrl?: string;
  tags?: { id: number; name: string; color: string }[];
  billing?: {
    currency: string;
    amount: number;
    billingCycle: string;
    expireDate: string;
    autoRenew: boolean;
  };
}

interface VPSState {
  vpsList: VPS[];
  selectedVPS: VPS | null;
  loading: boolean;
  setVPSList: (list: VPS[]) => void;
  setSelectedVPS: (vps: VPS | null) => void;
  setLoading: (loading: boolean) => void;
  updateVPS: (id: number, data: Partial<VPS>) => void;
  removeVPS: (id: number) => void;
}

export const useVPSStore = create<VPSState>((set) => ({
  vpsList: [],
  selectedVPS: null,
  loading: false,
  setVPSList: (list) => set({ vpsList: list }),
  setSelectedVPS: (vps) => set({ selectedVPS: vps }),
  setLoading: (loading) => set({ loading }),
  updateVPS: (id, data) =>
    set((state) => ({
      vpsList: state.vpsList.map((v) => (v.id === id ? { ...v, ...data } : v)),
      selectedVPS:
        state.selectedVPS?.id === id
          ? { ...state.selectedVPS, ...data }
          : state.selectedVPS,
    })),
  removeVPS: (id) =>
    set((state) => ({
      vpsList: state.vpsList.filter((v) => v.id !== id),
      selectedVPS: state.selectedVPS?.id === id ? null : state.selectedVPS,
    })),
}));

// 导出主题store
export { useThemeStore } from './theme';
