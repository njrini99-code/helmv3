import {
  Users,
  UserPlus,
  Trophy,
  Inbox,
  Search
} from 'lucide-react';

interface TableEmptyStateProps {
  type: 'roster' | 'recruits' | 'rounds' | 'messages' | 'search' | 'generic';
  searchQuery?: string;
  onAction?: () => void;
}

const emptyStates = {
  roster: {
    icon: Users,
    title: "No players yet",
    description: "Add players to start building your roster",
    actionLabel: "Add Player",
  },
  recruits: {
    icon: UserPlus,
    title: "No recruits in pipeline",
    description: "Start adding recruits to track your recruiting progress",
    actionLabel: "Find Recruits",
  },
  rounds: {
    icon: Trophy,
    title: "No rounds logged",
    description: "Log your first round to start tracking stats",
    actionLabel: "Log Round",
  },
  messages: {
    icon: Inbox,
    title: "No messages yet",
    description: "Messages with coaches and players will appear here",
    actionLabel: null,
  },
  search: {
    icon: Search,
    title: "No results found",
    description: "Try adjusting your search or filters",
    actionLabel: "Clear Filters",
  },
  generic: {
    icon: Inbox,
    title: "No data",
    description: "Nothing to display yet",
    actionLabel: null,
  },
};

export function TableEmptyState({ type, searchQuery, onAction }: TableEmptyStateProps) {
  const state = emptyStates[type];
  const Icon = state.icon;

  return (
    <div className="
      flex flex-col items-center justify-center
      py-16 px-4
      bg-white border border-warm-100
      rounded-2xl
    ">
      <div className="
        w-16 h-16 rounded-xl
        bg-primary-50
        flex items-center justify-center
        mb-4
      ">
        <Icon className="w-8 h-8 text-primary-600" />
      </div>

      <h3 className="text-lg font-semibold text-warm-900 mb-1">
        {type === 'search' && searchQuery
          ? `No results for "${searchQuery}"`
          : state.title
        }
      </h3>

      <p className="text-sm text-warm-500 text-center max-w-sm mb-6">
        {state.description}
      </p>

      {state.actionLabel && onAction && (
        <button
          onClick={onAction}
          className="
            inline-flex items-center gap-2
            px-5 py-2.5
            bg-primary-600 text-white
            font-medium text-sm
            rounded-md
            shadow-sm
            transition-all duration-200
            hover:bg-primary-700 hover:shadow-md
            active:scale-[0.98]
          "
        >
          {state.actionLabel}
        </button>
      )}
    </div>
  );
}
