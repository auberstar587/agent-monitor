/**
 * StatusDot - Agent status indicator dot
 * @param {object} props
 * @param {string} props.status - idle | working | meeting | away | error | offline
 * @param {string} [props.size='sm'] - sm | md | lg
 */
const STATUS_COLORS = {
  idle: '#3fb950',
  working: '#f59e0b',
  meeting: '#a371f7',
  away: '#6b7280',
  error: '#ef4444',
  failed: '#ef4444',
  offline: '#4b5563',
  speaking: '#06b6d4',
  running: '#f59e0b',
  completed: '#3fb950',
  queued: '#6b7280',
  dispatched: '#58a6ff',
  cancelled: '#4b5563',
  active: '#3fb950',
  inactive: '#6b7280',
};

const SIZE_MAP = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
};

export default function StatusDot({ status, size = 'sm', className = '' }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.offline;
  const sizeClass = SIZE_MAP[size] || SIZE_MAP.sm;

  return (
    <span
      className={`inline-block rounded-full ${sizeClass} ${className}`}
      style={{ backgroundColor: color }}
      title={status}
    />
  );
}
