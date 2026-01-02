interface AvatarNameCellProps {
  avatarUrl?: string | null;
  name: string;
  subtitle?: string;
  badge?: React.ReactNode;
}

export function AvatarNameCell({ avatarUrl, name, subtitle, badge }: AvatarNameCellProps) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-10 h-10 rounded-[10px] overflow-hidden flex-shrink-0 bg-warm-100">
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-warm-600 font-semibold text-sm">
            {initials}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-warm-900 truncate">{name}</span>
          {badge}
        </div>
        {subtitle && (
          <span className="text-xs text-warm-500 truncate block">{subtitle}</span>
        )}
      </div>
    </div>
  );
}
