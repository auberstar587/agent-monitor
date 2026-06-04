import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Square, Trash2, ChevronDown, ChevronRight, Bot } from "lucide-react";
import { api } from "../lib/api";
import CustomSelect from "../components/CustomSelect";
import type { EngineInfo } from "../lib/api";

/* ── 消息类型 ── */
interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool_use" | "tool_result" | "error" | "system";
  content: string;
  tool?: string;
  input?: Record<string, unknown>;
  output?: string;
  timestamp: number;
}

/* ── 生成唯一 ID ── */
let _seq = 0;
function uid(): string {
  return `msg-${Date.now()}-${++_seq}`;
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [selectedEngine, setSelectedEngine] = useState("claude-code");
  const [workingDir, setWorkingDir] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [engines, setEngines] = useState<EngineInfo[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; path: string }[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* ── 加载引擎和项目列表 ── */
  useEffect(() => {
    api.listEngines().then(setEngines).catch(() => {});
    api.listProjects().then((list) => {
      setProjects(list);
      // 自动选中 agent-monitor 项目（如果有）
      const monitor = list.find((p: any) => p.name === "agent-monitor");
      if (monitor) {
        setSelectedProjectId(monitor.id);
        setWorkingDir(monitor.path);
      }
    }).catch(() => {});
  }, []);

  /* ── 自动滚动到底部 ── */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ── 发送消息 ── */
  const handleSend = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || isStreaming) return;

    // 1. 用户消息
    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    };
    // 2. 空的 assistant 占位
    const assistantMsg: ChatMessage = {
      id: uid(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine: selectedEngine,
          prompt,
          workingDir: workingDir || undefined,
          projectId: selectedProjectId || undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status}: ${text}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        // 按 SSE 格式拆分（\n\n 分隔事件）
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.trim()) continue;
          let eventType = "message";
          let dataStr = "";

          for (const line of part.split("\n")) {
            if (line.startsWith("event:")) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataStr = line.slice(5).trim();
            }
          }

          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);

            if (eventType === "start") {
              // 记录 runId
              if (data.runId) setCurrentRunId(data.runId);
            } else if (eventType === "message") {
              if (data.type === "text" && data.content) {
                // 追加到 assistant 气泡
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: m.content + data.content }
                      : m,
                  ),
                );
              } else if (data.type === "tool_use") {
                // 插入 tool_use 卡片
                const toolMsg: ChatMessage = {
                  id: uid(),
                  role: "tool_use",
                  content: "",
                  tool: data.tool ?? data.name ?? "unknown",
                  input: data.input,
                  timestamp: Date.now(),
                };
                setMessages((prev) => [...prev, toolMsg]);
              } else if (data.type === "error") {
                const errMsg: ChatMessage = {
                  id: uid(),
                  role: "error",
                  content: data.content ?? data.message ?? "Unknown error",
                  timestamp: Date.now(),
                };
                setMessages((prev) => [...prev, errMsg]);
              }
            } else if (eventType === "done") {
              // 流结束
            } else if (eventType === "error") {
              const errMsg: ChatMessage = {
                id: uid(),
                role: "error",
                content: data.content ?? data.message ?? "Stream error",
                timestamp: Date.now(),
              };
              setMessages((prev) => [...prev, errMsg]);
            }
          } catch {
            // JSON 解析失败，忽略
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        const errMsg: ChatMessage = {
          id: uid(),
          role: "error",
          content: err.message ?? "Request failed",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errMsg]);
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, selectedEngine, workingDir]);

  /* ── 取消运行 ── */
  const handleCancel = useCallback(async () => {
    abortRef.current?.abort();
    if (currentRunId) {
      try {
        await fetch("/api/chat/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ engine: selectedEngine, runId: currentRunId }),
        });
      } catch {
        // 取消失败也不阻塞 UI
      }
    }
    setIsStreaming(false);
    setCurrentRunId(null);
  }, [currentRunId, selectedEngine]);

  /* ── 清空消息 ── */
  const handleClear = () => {
    setMessages([]);
    setCurrentRunId(null);
  };

  /* ── 键盘快捷键 ── */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-container chat-scroll">
      {/* ── 顶栏（topbar 风格，与其他页面 telemetry bar 一致） ── */}
      <div className="chat-topbar">
        <div className="chat-topbar-left">
          <CustomSelect
            value={selectedEngine}
            onChange={setSelectedEngine}
            options={engines.length === 0
              ? [{ value: "claude-code", label: "Claude Code" }]
              : engines.map((eng) => ({
                value: eng.id,
                label: `${eng.label}${!eng.installed ? " (未安装)" : ""}`,
                disabled: !eng.installed,
              }))}
            style={{ minWidth: 140 }}
          />
          <CustomSelect
            value={selectedProjectId}
            onChange={(id) => {
              setSelectedProjectId(id);
              const proj = projects.find((p) => p.id === id);
              setWorkingDir(proj ? proj.path : "");
            }}
            options={[
              { value: "", label: "选择项目…" },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
            className="flex-1"
            style={{ minWidth: 180 }}
          />
        </div>
        <button
          className="button"
          onClick={handleClear}
          disabled={messages.length === 0 || isStreaming}
          title="清空对话"
        >
          <Trash2 size={14} />
          清空
        </button>
      </div>

      {/* ── 消息区域 ── */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <Bot size={40} style={{ color: "var(--muted)", opacity: 0.4 }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
                开始对话
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
                输入消息，与 Agent 实时交互，流式查看响应
              </div>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* ── 输入栏 ── */}
      <div className="chat-input-bar">
        <textarea
          className="form-input"
          placeholder="输入消息… (Enter 发送, Shift+Enter 换行)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          rows={1}
          style={{
            flex: 1,
            resize: "none",
            minHeight: 40,
            maxHeight: 120,
            padding: "8px 12px",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        />
        <button
          className={`chat-send-btn ${isStreaming ? "streaming" : ""}`}
          onClick={isStreaming ? handleCancel : handleSend}
          disabled={!isStreaming && !input.trim()}
          title={isStreaming ? "停止" : "发送"}
        >
          {isStreaming ? <Square size={14} /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   消息气泡组件
   ═══════════════════════════════════════════════ */
function MessageBubble({ msg }: { msg: ChatMessage }) {
  // tool_use 卡片折叠状态
  const [expanded, setExpanded] = useState(false);

  if (msg.role === "user") {
    return (
      <div className="chat-bubble-user">
        <div className="chat-bubble-content">{msg.content}</div>
      </div>
    );
  }

  if (msg.role === "assistant") {
    // 空内容 + 流式中不显示
    if (!msg.content) return null;
    return (
      <div className="chat-bubble-assistant">
        <div className="chat-bubble-content">
          <SimpleMarkdown>{msg.content}</SimpleMarkdown>
        </div>
      </div>
    );
  }

  if (msg.role === "tool_use") {
    return (
      <div className="chat-tool-card">
        <div
          className="chat-tool-card-header"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span style={{ fontFamily: "inherit" }}>{msg.tool ?? "tool"}</span>
        </div>
        {expanded && msg.input && (
          <div className="chat-tool-card-body">
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {JSON.stringify(msg.input, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  }

  if (msg.role === "tool_result") {
    return (
      <div className="chat-tool-card">
        <div
          className="chat-tool-card-header"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span style={{ fontFamily: "inherit" }}>{msg.tool ? `${msg.tool} → result` : "result"}</span>
        </div>
        {expanded && (msg.output ?? msg.content) && (
          <div className="chat-tool-card-body">
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {msg.output ?? msg.content}
            </pre>
          </div>
        )}
      </div>
    );
  }

  if (msg.role === "error") {
    return <div className="chat-error">{msg.content}</div>;
  }

  // system
  return (
    <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: "8px 0" }}>
      {msg.content}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   轻量 Markdown 渲染器（表格 + 代码块 + 行内格式）
   ═══════════════════════════════════════════════ */

/** 转义 HTML 特殊字符 */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 渲染行内 markdown：**bold**、*italic*、`code`、[link](url) */
function renderInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '<code style="background:var(--paper);padding:1px 4px;border-radius:3px;font-size:0.9em">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:var(--accent)">$1</a>');
}

/** 检测 markdown 表格行 */
function isTableRow(line: string): boolean {
  return /^\|.*\|$/.test(line.trim());
}
function isTableSeparator(line: string): boolean {
  return /^\|[\s\-:]+\|$/.test(line.trim());
}

/** 渲染 markdown 表格为 HTML */
function renderTable(rows: string[]): string {
  const parsed = rows
    .filter((r) => !isTableSeparator(r))
    .map((r) =>
      r.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()),
    );
  if (parsed.length === 0) return "";
  const head = parsed[0];
  const body = parsed.slice(1);
  let html = '<table class="chat-md-table"><thead><tr>';
  for (const h of head) html += `<th>${renderInline(esc(h))}</th>`;
  html += "</tr></thead><tbody>";
  for (const row of body) {
    html += "<tr>";
    for (let i = 0; i < head.length; i++) {
      html += `<td>${renderInline(esc(row[i] ?? ""))}</td>`;
    }
    html += "</tr>";
  }
  html += "</tbody></table>";
  return html;
}

/** 将 markdown 文本渲染为 HTML 字符串 */
function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const parts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    // 代码块 ```
    if (lines[i].startsWith("```")) {
      const lang = lines[i].slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      parts.push(
        `<pre class="chat-md-code"${lang ? ` data-lang="${esc(lang)}"` : ""}><code>${esc(codeLines.join("\n"))}</code></pre>`,
      );
      continue;
    }

    // 表格
    if (isTableRow(lines[i]) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const tableRows: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        tableRows.push(lines[i]);
        i++;
      }
      parts.push(renderTable(tableRows));
      continue;
    }

    // 标题
    const heading = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (heading) {
      const lvl = heading[1].length;
      parts.push(`<h${lvl} class="chat-md-h${lvl}">${renderInline(esc(heading[2]))}</h${lvl}>`);
      i++;
      continue;
    }

    // 列表项
    if (/^[-*]\s+/.test(lines[i])) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(esc(lines[i].replace(/^[-*]\s+/, "")))}</li>`);
        i++;
      }
      parts.push(`<ul class="chat-md-list">${items.join("")}</ul>`);
      continue;
    }

    // 水平线 --- / ***
    if (/^[-*_]{3,}\s*$/.test(lines[i].trim())) {
      i++;
      continue; // 跳过，不渲染
    }

    // 空行
    if (!lines[i].trim()) {
      i++;
      continue; // 跳过，不渲染
    }

    // 普通段落
    parts.push(`<p>${renderInline(esc(lines[i]))}</p>`);
    i++;
  }

  return parts.join("");
}

function SimpleMarkdown({ children }: { children: string }) {
  const html = markdownToHtml(children);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
