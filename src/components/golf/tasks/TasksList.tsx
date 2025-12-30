'use client';

import { motion } from 'framer-motion';
import { TaskCard } from './TaskCard';
import { IconClipboardList } from '@/components/icons';
import { staggerContainer } from '@/lib/motion';

interface Task {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  created_at: string;
  assignments: Array<{
    id: string;
    status: string;
    completed_at: string | null;
    player: {
      first_name: string;
      last_name: string;
    };
  }>;
}

interface TasksListProps {
  tasks: Task[];
  filter: 'all' | 'active' | 'completed';
}

export function TasksList({ tasks, filter }: TasksListProps) {
  const filteredTasks = tasks.filter(task => {
    if (filter === 'all') return true;
    if (filter === 'active') return task.status === 'active';
    if (filter === 'completed') return task.status === 'completed';
    return true;
  });

  if (filteredTasks.length === 0) {
    return (
      <div className="text-center py-12">
        <IconClipboardList size={48} className="mx-auto text-slate-300 mb-4" />
        <h3 className="text-lg font-medium text-slate-900 mb-2">
          No {filter !== 'all' && filter} tasks
        </h3>
        <p className="text-slate-500">
          {filter === 'all'
            ? "Create your first task to get started"
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
        <TaskCard key={task.id} task={task} />
      ))}
    </motion.div>
  );
}
