import { Component, type ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen p-6" style={{ background: "var(--paper)" }}>
          <div className="text-center max-w-md">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--danger)" }}>页面出现错误</h2>
            <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
              {this.state.error?.message || "未知错误"}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="button button-primary"
            >
              重新加载
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
