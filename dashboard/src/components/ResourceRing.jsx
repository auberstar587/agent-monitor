/**
 * ResourceRing - Small circular progress indicator for system resources
 * @param {object} props
 * @param {number} props.value - Percentage (0-100)
 * @param {string} props.label - Label text
 * @param {string} props.color - Ring color (hex)
 * @param {number} [props.size=48] - Ring diameter in pixels
 */
export default function ResourceRing({ value = 0, label, color = '#06b6d4', size = 48 }) {
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(value, 100) / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div className="text-center">
        <div className="text-xs font-semibold" style={{ color }}>
          {Math.round(value)}%
        </div>
        <div className="text-[10px] text-gray-500 uppercase">{label}</div>
      </div>
    </div>
  );
}
