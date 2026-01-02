import { cn } from '@/lib/utils';

interface QuickAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'primary';
}

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <div
      className="
      flex items-center gap-2
      p-2
      bg-white/50 backdrop-blur-[8px]
      border border-white/30
      rounded-[14px]
      shadow-[0_1px_3px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,0.4)]
    "
    >
      {actions.map((action, index) => (
        <button
          key={index}
          onClick={action.onClick}
          className={cn(
            'flex items-center gap-2',
            'px-4 py-2.5',
            'rounded-[10px]',
            'text-sm font-medium',
            'transition-all duration-200',
            action.variant === 'primary'
              ? [
                  'bg-primary-600 text-white',
                  'shadow-[0_2px_4px_rgba(22,163,74,0.2),inset_0_1px_0_rgba(255,255,255,0.15)]',
                  'hover:bg-primary-700',
                  'hover:shadow-[0_4px_8px_rgba(22,163,74,0.25),inset_0_1px_0_rgba(255,255,255,0.2)]',
                  'hover:-translate-y-0.5',
                  'active:translate-y-0',
                ]
              : [
                  'bg-white/60 text-warm-700',
                  'border border-white/30',
                  'hover:bg-white/80',
                  'hover:border-white/50',
                ]
          )}
        >
          {action.icon}
          {action.label}
        </button>
      ))}
    </div>
  );
}
