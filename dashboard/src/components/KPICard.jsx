import { TrendingUp, TrendingDown } from 'lucide-react';

/**
 * KPICard - Key performance indicator card
 * @param {object} props
 * @param {string} props.title - Card title
 * @param {string|number} props.value - Main value
 * @param {string} [props.subtitle] - Subtitle text
 * @param {string} [props.accentColor] - Accent color (hex)
 * @param {React.ReactNode} [props.icon] - Icon component
 * @param {string} [props.trend] - Trend direction: 'up' | 'down' | null
 */
export default function KPICard({
  title,
  value,
  subtitle,
  accentColor = '#06b6d4',
  icon: Icon,
  trend,
}) {
  return (
    <div className="bg-[#1a1a2e] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-all duration-200">
      <div className="flex items-start justify-between mb-3">
        <span className="text-sm text-gray-400 font-medium">{title}</span>
        {Icon && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${accentColor}15` }}
          >
            <Icon className="w-4 h-4" style={{ color: accentColor }} />
          </div>
        )}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold" style={{ color: accentColor }}>
          {value}
        </span>
        {trend && (
          <span className={`flex items-center text-xs font-medium ${trend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
            {trend === 'up' ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
          </span>
        )}
      </div>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}
