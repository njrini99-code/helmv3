'use client';

import { useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PlayerHub } from './PlayerHub';
import { completeTask } from '@/app/golf/actions/tasks';
import { respondToEvent } from '@/app/golf/actions/golf';

interface TripData {
  id: string;
  event_name: string;
  destination: string;
  transportation_type: 'bus' | 'van' | 'fly' | 'carpool';
  departure_date: string;
  departure_time: string | null;
  departure_location: string | null;
  return_date: string | null;
  return_time: string | null;
  hotel_name: string | null;
  hotel_address: string | null;
  hotel_phone: string | null;
  hotel_confirmation: string | null;
  uniform_requirements: string | null;
  gear_list: string | null;
  room_assignments: string | null;
  notes: string | null;
  flight_info: string | null;
}

interface PlayerTask {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  category: string | null;
  requires_upload: boolean;
  status: 'pending' | 'overdue' | 'completed';
  completed_at: string | null;
}

interface EventInvite {
  id: string;
  event_id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  is_mandatory: boolean;
  rsvp_status: 'pending' | 'accepted' | 'declined' | 'tentative' | null;
  going_count: number;
  maybe_count: number;
}

interface PlayerHubWrapperProps {
  trips: TripData[];
  tasks: PlayerTask[];
  events: EventInvite[];
  playerName: string;
}

export function PlayerHubWrapper({ trips, tasks: initialTasks, events: initialEvents, playerName }: PlayerHubWrapperProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [events, setEvents] = useState(initialEvents);
  const [, startTransition] = useTransition();

  const handleCompleteTask = useCallback(async (taskId: string) => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, status: 'completed' as const, completed_at: new Date().toISOString() } : t
    ));

    const result = await completeTask(taskId);

    if (!result.success) {
      // Revert on failure
      setTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, status: 'pending' as const, completed_at: null } : t
      ));
    }

    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  const handleRSVP = useCallback(async (eventId: string, status: 'accepted' | 'declined' | 'tentative') => {
    // Optimistic update
    setEvents(prev => prev.map(e =>
      e.event_id === eventId ? { ...e, rsvp_status: status } : e
    ));

    const rsvpStatus = status === 'accepted' ? 'accepted' :
      status === 'tentative' ? 'tentative' : 'declined';

    const result = await respondToEvent(eventId, rsvpStatus);

    if (!result.success) {
      // Revert on failure
      setEvents(initialEvents);
    }

    startTransition(() => {
      router.refresh();
    });
  }, [router, initialEvents]);

  return (
    <PlayerHub
      trips={trips}
      tasks={tasks}
      events={events}
      playerName={playerName}
      onCompleteTask={handleCompleteTask}
      onRSVP={handleRSVP}
    />
  );
}
