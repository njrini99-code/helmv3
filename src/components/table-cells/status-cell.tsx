type Status = 'active' | 'inactive' | 'pending' | 'committed' | 'interested' | 'injured';

const statusStyles: Record<Status, { bg: string; text: string; dot: string }> = {
  active: { bg: 'bg-primary-50', text: 'text-primary-700', dot: 'bg-primary-500' },
  inactive: { bg: 'bg-warm-100', text: 'text-warm-600', dot: 'bg-warm-400' },
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  committed: { bg: 'bg-primary-50', text: 'text-primary-700', dot: 'bg-primary-500' },
  interested: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  injured: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
};

export function StatusCell({ status }: { status: Status }) {
  const styles = statusStyles[status] || statusStyles.inactive;

  return (
    <span className={`
      inline-flex items-center gap-1.5
      px-2.5 py-1
      text-xs font-medium
      rounded-full
      ${styles.bg} ${styles.text}
    `}>
      <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
