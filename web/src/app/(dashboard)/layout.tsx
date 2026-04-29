import { Providers } from '@/components/providers';
import { Sidebar } from '@/components/sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <div className="flex min-h-screen bg-background text-foreground">
        <Sidebar />
        <main className="flex-1 ml-14 p-6">{children}</main>
      </div>
    </Providers>
  );
}
