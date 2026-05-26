import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Bot,
  Settings,
  Cpu,
  HardDrive,
  MemoryStick,
  Activity,
  Package,
  Video,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { fetchSystemStats } from '../api/system';
import ResourceRing from './ResourceRing';

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: '总览' },
  { to: '/projects', icon: FolderKanban, label: '项目' },
  { to: '/tasks', icon: CheckSquare, label: '任务' },
  { to: '/agents', icon: Bot, label: 'Agent' },
  { to: '/artifacts', icon: Package, label: '产物', disabled: true },
  { to: '/meetings', icon: Video, label: '会议', disabled: true },
  { to: '/settings', icon: Settings, label: '设置' },
];

export default function Layout() {
  const location = useLocation();
  const systemStats = useStore((s) => s.systemStats);
  const setSystemStats = useStore((s) => s.setSystemStats);
  const agents = useStore((s) => s.agents);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Poll system stats every 10s
  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchSystemStats();
        setSystemStats(data);
      } catch (err) {
        console.warn('[Layout] Failed to fetch system stats:', err.message);
      }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [setSystemStats]);

  // Count online agents
  const onlineAgents = agents.filter((a) => a.status !== 'away' && a.status !== 'offline').length;

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-[#111118] border-r border-white/5 flex flex-col">
        {/* Logo / Title */}
        <div className="h-14 flex items-center px-5 border-b border-white/5">
          <Activity className="w-5 h-5 text-cyan-500 mr-2.5" />
          <span className="text-base font-semibold tracking-tight">Agent Monitor</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-3 space-y-0.5">
          {NAV_ITEMS.map(({ to, icon: Icon, label, disabled }) => (
            <div key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    disabled
                      ? 'text-gray-600 cursor-not-allowed pointer-events-none'
                      : isActive
                        ? 'bg-white/[0.08] text-white'
                        : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                  }`
                }
              >
                <Icon className="w-4.5 h-4.5" />
                {label}
              </NavLink>
              {disabled && (
                <span className="ml-8 text-[10px] text-gray-600">Coming Soon</span>
              )}
            </div>
          ))}
        </nav>

        {/* System Resources */}
        <div className="px-4 py-4 border-t border-white/5">
          <div className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">系统资源</div>
          <div className="flex items-center justify-between gap-2">
            <ResourceRing
              value={systemStats?.cpu?.usagePercent ?? 0}
              label="CPU"
              color="#06b6d4"
              size={48}
            />
            <ResourceRing
              value={systemStats?.memory?.usagePercent ?? 0}
              label="MEM"
              color="#8b5cf6"
              size={48}
            />
            <ResourceRing
              value={systemStats?.disk?.usagePercent ?? 0}
              label="DISK"
              color="#f59e0b"
              size={48}
            />
          </div>
        </div>

        {/* Online indicator */}
        <div className="px-4 py-3 border-t border-white/5">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {onlineAgents} 个 Agent 在线
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-14 flex items-center justify-between px-6 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-sm flex-shrink-0">
          <h1 className="text-sm font-medium text-gray-300">
            {NAV_ITEMS.find((n) => {
              if (n.to === '/') return location.pathname === '/';
              return location.pathname.startsWith(n.to);
            })?.label || 'Agent Monitor'}
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              {new Date().toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' })}
            </span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
