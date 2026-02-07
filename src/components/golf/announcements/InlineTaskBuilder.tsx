'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconPlus, IconX, IconCalendar } from '@/components/icons';

export interface InlineTask {
  title: string;
  description?: string;
  dueDate?: string;
}

interface InlineTaskBuilderProps {
  tasks: InlineTask[];
  onChange: (tasks: InlineTask[]) => void;
}

export function InlineTaskBuilder({ tasks, onChange }: InlineTaskBuilderProps) {
  function addTask() {
    onChange([...tasks, { title: '' }]);
  }

  function removeTask(index: number) {
    onChange(tasks.filter((_, i) => i !== index));
  }

  function updateTask(index: number, field: keyof InlineTask, value: string) {
    const updated = tasks.map((t, i) => {
      if (i !== index) return t;
      if (field === 'title') return { ...t, title: value };
      return { ...t, [field]: value || undefined };
    });
    onChange(updated);
  }

  return (
    <div>
      <label className="text-sm font-medium text-slate-700 block mb-2">
        Tasks
      </label>

      <AnimatePresence mode="popLayout">
        {tasks.map((task, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={{ duration: 0.2 }}
            layout
            className="mb-2"
          >
            <div className="relative border border-slate-200 rounded-xl p-3 bg-white/50">
              {/* Remove button */}
              <button
                type="button"
                onClick={() => removeTask(index)}
                className="absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
              >
                <IconX size={14} />
              </button>

              {/* Task number badge */}
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-md bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                  {index + 1}
                </span>
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Task</span>
              </div>

              {/* Task title */}
              <input
                type="text"
                value={task.title}
                onChange={(e) => updateTask(index, 'title', e.target.value)}
                placeholder="Task title..."
                className="w-full text-sm font-medium text-slate-900 placeholder:text-slate-400 bg-transparent outline-none mb-2"
                autoFocus={task.title === ''}
              />

              {/* Description + Due date row */}
              <div className="flex items-start gap-2">
                <textarea
                  value={task.description || ''}
                  onChange={(e) => updateTask(index, 'description', e.target.value)}
                  placeholder="Description (optional)"
                  rows={1}
                  className={cn(
                    'flex-1 text-xs text-slate-600 placeholder:text-slate-400 bg-transparent',
                    'outline-none resize-none border-none p-0'
                  )}
                />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <IconCalendar size={12} className="text-slate-400" />
                  <input
                    type="date"
                    value={task.dueDate || ''}
                    onChange={(e) => updateTask(index, 'dueDate', e.target.value)}
                    className="text-xs text-slate-600 bg-transparent outline-none border-none w-[110px]"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={addTask}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed transition-all text-sm',
          'border-slate-300 hover:border-green-300 text-slate-500 hover:text-green-700 hover:bg-green-50/50'
        )}
      >
        <IconPlus size={14} />
        <span>Add Task</span>
      </motion.button>
    </div>
  );
}
