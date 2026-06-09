import { Outlet, Link, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard, FolderKanban, Bot, FileText,
  Brain, Inbox, GitBranch, ListTodo, Activity, Menu, Monitor,
  Moon, PanelLeftClose, PanelLeftOpen, Settings, Sun, MessageSquare, Gauge,
} from "lucide-react";
import { useStore } from "../stores";

const NAV_ITEMS = [
  { path: "/", label: "总览", icon: LayoutDashboard },
  { path: "/projects", label: "项目", icon: FolderKanban },
  { path: "/agents", label: "Agents", icon: Bot },
  { path: "/outputs", label: "输出", icon: FileText },
  { path: "/memory", label: "记忆", icon: Brain },
  { path: "/inbox", label: "收件箱", icon: Inbox },
  { path: "/blueprints", label: "蓝图", icon: GitBranch },
  { path: "/chat", label: "对话", icon: MessageSquare },
  { path: "/tasks", label: "任务", icon: ListTodo },
  { path: "/settings", label: "设置", icon: Settings },
  { path: "/quota", label: "用量", icon: Gauge },
];

const PAGE_META = [
  { match: "/", title: "总览", eyebrow: "Cockpit", desc: "项目、Agent、输出与待处理事项的统一入口" },
  { match: "/projects", title: "项目", eyebrow: "Workspace", desc: "本地项目注册、状态和关系管理" },
  { match: "/agents", title: "Agents", eyebrow: "Supervision", desc: "查看 Agent 在线状态和当前任务" },
  { match: "/outputs", title: "输出", eyebrow: "Artifacts", desc: "跨工具输出、决策和分析记录" },
  { match: "/memory", title: "记忆库", eyebrow: "Memory", desc: "跨项目共享：决策、规则、上下文、偏好、经验" },
  { match: "/inbox", title: "收件箱", eyebrow: "Attention", desc: "需要你介入的决策、阻塞和审查请求" },
  { match: "/blueprints", title: "蓝图", eyebrow: "Automation", desc: "多 Agent 工作流编排与运行" },
  { match: "/chat", title: "对话", eyebrow: "Cowork", desc: "与 Agent 直接对话，发送任务，查看流式响应" },
  { match: "/tasks", title: "任务", eyebrow: "Tasks", desc: "任务管理与状态流转" },
  { match: "/settings", title: "设置", eyebrow: "Preferences", desc: "主题、布局和本地工作台偏好" },
  { match: "/quota", title: "用量", eyebrow: "Quotas", desc: "GLM Coding Plan 与 Minimax 套餐余量" },
];

const THEME_LABELS: Record<string, string> = {
  light: "浅色",
  dark: "深色",
  system: "跟随系统",
};

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemePreference(preference: string) {
  const resolved = preference === "system" ? getSystemTheme() : preference;
  document.documentElement.dataset.theme = resolved;
  localStorage.setItem("agent-monitor-theme", preference);
  window.dispatchEvent(new CustomEvent("agent-monitor-theme", { detail: preference }));
}

export default function Layout() {
  const location = useLocation();
  const inbox = useStore((s) => s.inbox);
  const inboxCount = inbox.filter((i: any) => i.status === "pending").length;
  const [theme, setTheme] = useState(() => localStorage.getItem("agent-monitor-theme") || "system");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const pageMeta = useMemo(() => (
    PAGE_META.find((item) =>
      item.match === "/" ? location.pathname === "/" : location.pathname.startsWith(item.match),
    ) ?? PAGE_META[0]
  ), [location.pathname]);

  useEffect(() => {
    applyThemePreference(theme);
  }, [theme]);

  useEffect(() => {
    const syncTheme = (event: Event) => {
      const next = (event as CustomEvent<string>).detail;
      if (next) setTheme(next);
    };
    window.addEventListener("agent-monitor-theme", syncTheme);
    return () => window.removeEventListener("agent-monitor-theme", syncTheme);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => {
      if ((localStorage.getItem("agent-monitor-theme") || "system") === "system") {
        document.documentElement.dataset.theme = getSystemTheme();
      }
    };
    media.addEventListener("change", syncSystemTheme);
    return () => media.removeEventListener("change", syncSystemTheme);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
    // Reset the workspace scroll on route change so the new page starts at the top.
    document.querySelector(".workspace-main")?.scrollTo({ top: 0, behavior: "auto" });
  }, [location.pathname]);

  const toggleTheme = () => {
    setTheme((current) => current === "system" ? "light" : current === "light" ? "dark" : "system");
  };

  const ThemeIcon = theme === "system" ? Monitor : theme === "light" ? Sun : Moon;

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button className="sidebar-backdrop" aria-label="关闭菜单" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`sidebar-shell ${sidebarOpen ? "open" : ""} ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-brand">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="brand-mark">
              <Activity size={15} style={{ color: "var(--accent)" }} />
            </div>
            <div className="sidebar-copy">
              <h1 className="text-sm font-semibold tracking-wide" style={{ color: "var(--text)" }}>
                Agent Monitor
              </h1>
              <p className="text-[11px]" style={{ color: "var(--muted)" }}>v2.0.0</p>
            </div>
          </div>
          <button
            className="icon-btn sidebar-collapse"
            onClick={() => setSidebarCollapsed((value) => !value)}
            title={sidebarCollapsed ? "展开菜单" : "收起菜单"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label" style={{ color: "var(--muted)" }}>
            导航
          </div>
          <div className="space-y-0.5">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
              const active = path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);
              return (
                <Link
                  key={path}
                  to={path}
                  className={`nav-item ${active ? "active" : ""}`}
                  title={sidebarCollapsed ? label : undefined}
                >
                  <Icon size={15} />
                  <span className="nav-label flex-1">{label}</span>
                  {label === "收件箱" && inboxCount > 0 && (
                    <span className="nav-count">
                      {inboxCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-status" style={{ color: "var(--muted)" }}>
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "var(--success)", boxShadow: "0 0 6px var(--success)" }}
            />
            <span className="sidebar-copy">系统在线</span>
          </div>
        </div>
      </aside>

      <section className="workspace-shell">
        <header className="page-header">
          <div className="flex items-center gap-3 min-w-0">
            <button className="icon-btn mobile-menu" onClick={() => setSidebarOpen(true)} title="打开菜单">
              <Menu size={17} />
            </button>
            <div className="page-header-title min-w-0">
              <span>{pageMeta.eyebrow}</span>
              <h1>{pageMeta.title}</h1>
              <p>{pageMeta.desc}</p>
            </div>
          </div>
          <div className="page-header-actions">
            <button className="button theme-toggle" onClick={toggleTheme}>
              <ThemeIcon size={13} />
              {THEME_LABELS[theme] ?? "跟随系统"}
            </button>
            <Link to="/settings" className="icon-btn" title="设置">
              <Settings size={16} />
            </Link>
          </div>
        </header>

        <main className="workspace-main">
          <div className="workspace-content">
            <Outlet />
          </div>
        </main>
      </section>
    </div>
  );
}
