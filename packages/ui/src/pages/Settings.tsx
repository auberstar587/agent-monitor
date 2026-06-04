import { useEffect, useState } from "react";
import { Monitor, MonitorCog, Moon, PanelLeft, Sun } from "lucide-react";

const THEMES = [
  {
    id: "system",
    label: "跟随系统",
    icon: Monitor,
    desc: "使用 macOS / 浏览器的外观设置。",
  },
  {
    id: "light",
    label: "浅色",
    icon: Sun,
    desc: "白天更清楚，适合强光环境。",
  },
  {
    id: "dark",
    label: "深色",
    icon: Moon,
    desc: "低干扰界面，适合长时间盯监控。",
  },
];

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemePreference(preference: string) {
  const resolved = preference === "system" ? getSystemTheme() : preference;
  document.documentElement.dataset.theme = resolved;
  localStorage.setItem("agent-monitor-theme", preference);
  window.dispatchEvent(new CustomEvent("agent-monitor-theme", { detail: preference }));
}

export default function Settings() {
  const [theme, setTheme] = useState(() => localStorage.getItem("agent-monitor-theme") || "system");

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

  const applyTheme = (next: string) => {
    setTheme(next);
    applyThemePreference(next);
  };

  return (
    <div className="p-0 max-w-5xl settings-scroll">
      <div className="mb-6">
        <p className="page-subtitle">调整本地工作台的外观和空间组织。</p>
      </div>

      <div className="settings-grid">
        <section className="settings-panel">
          <div className="settings-panel-head">
            <div className="settings-icon">
              <MonitorCog size={17} />
            </div>
            <div>
              <h2>主题</h2>
              <p>选择浅色、深色，或跟随系统外观。</p>
            </div>
          </div>

          <div className="theme-options">
            {THEMES.map(({ id, label, desc, icon: Icon }) => (
              <button
                key={id}
                className={`theme-option ${theme === id ? "active" : ""}`}
                onClick={() => applyTheme(id)}
              >
                <Icon size={16} />
                <span>
                  <strong>{label}</strong>
                  <small>{desc}</small>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="settings-panel">
          <div className="settings-panel-head">
            <div className="settings-icon">
              <PanelLeft size={17} />
            </div>
            <div>
              <h2>布局</h2>
              <p>当前已拆成左侧菜单、顶部 Head 和主工作窗口。</p>
            </div>
          </div>

          <div className="layout-preview">
            <div className="layout-preview-menu">Menu</div>
            <div className="layout-preview-body">
              <div className="layout-preview-head">Head</div>
              <div className="layout-preview-main">Main Window</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
