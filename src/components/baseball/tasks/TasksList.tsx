'use client';

import { motion } from 'framer-motion';
import { TaskCard } from './TaskCard';
import { IconClipboardList } from '@/components/icons';
import { staggerContainer } from '@/lib/motion';

interface Assignment {
  id: string;
  player_id: string;
  status: string;
  completed_at: string | null;
  player_first_name: string;
  player_last_name: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  priority: string | null;
  category: string | null;
  created_at: string;
  reminder_at?: string | null;
  assignments: Assignment[];
}

interface TasksListProps {
  tasks: Task[];
  filter: 'all' | 'active' | 'completed' | 'overdue';
  isCoach: boolean;
  currentPlayerId?: string | null;
  onRefresh: () => void;
}

export function TasksList({ tasks, filter, isCoach, currentPlayerId, onRefresh }: TasksListProps) {
  const now = new Date();

  const filteredTasks = tasks.filter(task => {
    if (filter === 'all') return true;
    if (filter === 'active') return task.status === 'active';
    if (filter === 'completed') return task.status === 'completed';
    if (filter === 'overdue') {
      return task.due_date && new Date(task.due_date) < now && task.status !== 'completed';
    }
    return true;
  });

  if (filteredTasks.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-4">
          <IconClipboardList size={24} className="text-warm-400" />
        </div>
        <h3 className="text-lg font-medium text-warm-900 mb-2">
          No {filter !== 'all' && filter} tasks
        </h3>
        <p className="text-warm-500">
          {filter === 'all'
            ? isCoach
              ? 'Create your first task to get started'
              : 'No tasks assigned to you yet'
            : `No ${filter} tasks found`}
        </p>
      </div>
    );
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-4"
    >
      {filteredTasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          isCoach={isCoach}
          currentPlayerId={currentPlayerId}
          onRefresh={onRefresh}
        />
      ))}
    </motion.div>
  );
}
