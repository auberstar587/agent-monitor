import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { fetchSystemStats } from '../api/system';
import ResourceRing from '../components/ResourceRing';
import { Save, RefreshCw, Database, Server, Clock, Monitor } from 'lucide-react';

export default function Settings() {
  const systemStats = useStore((s) => s.systemStats);
  const setSystemStats = useStore((s) => s.setSystemStats);
  const [apiUrl, setApiUrl] = useState(localStorage.getItem('apiUrl') || 'http://localhost:3001');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchSystemStats().then(setSystemStats).catch(() => {});
  }, [setSystemStats]);

  const handleSave = () => {
    localStorage.setItem('apiUrl', apiUrl);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleRefresh = async () => {
    try {
      const stats = await fetchSystemStats();
      setSystemStats(stats);
    } catch (err) {
      console.warn('Failed to refresh stats:', err.message);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* API Configuration */}
      <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-6">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Server className="w-4 h-4 text-cyan-500" />
          API 配置
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">API 端点</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="flex-1 px-3 py-2 bg-[#0a0a0f] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
              />
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
              >
                <Save className="w-3.5 h-3.5" />
                {saved ? '已保存' : '保存'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* System Resources */}
      <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Monitor className="w-4 h-4 text-cyan-500" />
            系统资源
          </h2>
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg hover:bg-white/[0.04] text-gray-500 hover:text-gray-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center justify-around gap-4">
          <div className="text-center">
            <ResourceRing value={systemStats?.cpu?.usagePercent ?? 0} label="CPU" color="#06b6d4" size={80} />
            <p className="text-xs text-gray-500 mt-2">{systemStats?.cpu?.cores ?? '?'} 核心</p>
          </div>
          <div className="text-center">
            <ResourceRing value={systemStats?.memory?.usagePercent ?? 0} label="MEM" color="#8b5cf6" size={80} />
            <p className="text-xs text-gray-500 mt-2">
              {systemStats ? `${formatBytes(systemStats.memory?.used)} / ${formatBytes(systemStats.memory?.total)}` : '—'}
            </p>
          </div>
          <div className="text-center">
            <ResourceRing value={systemStats?.disk?.usagePercent ?? 0} label="DISK" color="#f59e0b" size={80} />
            <p className="text-xs text-gray-500 mt-2">
              {systemStats ? `${formatBytes(systemStats.disk?.used)} / ${formatBytes(systemStats.disk?.total)}` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* System Info */}
      <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-6">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Database className="w-4 h-4 text-cyan-500" />
          系统信息
        </h2>
        <div className="space-y-3">
          <InfoRow label="操作系统" value={systemStats?.os || '—'} icon={Monitor} />
          <InfoRow label="平台" value={systemStats?.platform || '—'} icon={Server} />
          <InfoRow label="版本" value="1.0.0" icon={Database} />
          <InfoRow label="启动时间" value={new Date().toLocaleString('zh-CN')} icon={Clock} />
        </div>
      </div>

      {/* Data Management */}
      <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-6">
        <h2 className="text-sm font-semibold text-white mb-4">数据管理</h2>
        <div className="flex gap-3">
          <button className="px-4 py-2 text-sm text-gray-300 border border-white/10 rounded-lg hover:bg-white/[0.04] transition-colors">
            导出数据
          </button>
          <button className="px-4 py-2 text-sm text-gray-300 border border-white/10 rounded-lg hover:bg-white/[0.04] transition-colors">
            导入数据
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, icon: Icon }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
      </div>
      <span className="text-sm text-white">{value}</span>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
