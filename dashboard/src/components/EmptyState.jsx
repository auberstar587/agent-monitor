import { Inbox } from 'lucide-react';

/**
 * EmptyState - Placeholder when no data is available
 * @param {object} props
 * @param {string} [props.title] - Title text
 * @param {string} [props.description] - Description text
 * @param {React.ReactNode} [props.icon] - Custom icon
 * @param {React.ReactNode} [props.action] - Action button
 */
export default function EmptyState({
  title = '暂无数据',
  description = '当前没有可显示的内容',
  icon: Icon = Inbox,
  action,
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-500">
      <Icon className="w-12 h-12 mb-4 text-gray-600" />
      <h3 className="text-base font-medium text-gray-400 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 mb-4">{description}</p>
      {action}
    </div>
  );
}
