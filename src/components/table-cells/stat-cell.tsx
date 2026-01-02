interface StatCellProps {
  value: string | number;
  label?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export function StatCell({ value, label, trend }: StatCellProps) {
  return (
    <div>
      <span className={`
        font-semibold text-sm
        ${trend === 'up' ? 'text-primary-600' :
          trend === 'down' ? 'text-red-600' :
          'text-warm-900'}
      `}>
        {value}
      </span>
      {label && (
        <span className="text-xs text-warm-400 ml-1">{label}</span>
      )}
    </div>
  );
}
