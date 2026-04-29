'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bot, ListTodo, FolderKanban, Radio,
  BarChart3, Settings, Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', icon: BarChart3, label: '概览' },
  { href: '/agents', icon: Bot, label: 'Agents' },
  { href: '/tasks', icon: ListTodo, label: '任务' },
  { href: '/projects', icon: FolderKanban, label: '项目' },
  { href: '/meeting', icon: Radio, label: '会议室' },
  { href: '/system', icon: Activity, label: '系统' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-14 border-r bg-sidebar flex flex-col items-center py-4 gap-1">
      {/* Logo */}
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center mb-4">
        <Bot className="w-4 h-4 text-white" />
      </div>

      {/* Nav Items */}
      <nav className="flex flex-col gap-1 flex-1">
        {navItems.map((item) => {
          const active = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
                'hover:bg-sidebar-accent',
                active
                  ? 'bg-sidebar-accent text-sidebar-foreground'
                  : 'text-sidebar-foreground/60 hover:text-sidebar-foreground'
              )}
              title={item.label}
            >
              <item.icon className="w-5 h-5" />
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <Link
        href="/settings"
        className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
          'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent',
          pathname === '/settings' && 'bg-sidebar-accent text-sidebar-foreground'
        )}
        title="设置"
      >
        <Settings className="w-5 h-5" />
      </Link>
    </aside>
  );
}
