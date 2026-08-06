'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/sonner';
import { useGolfUser } from '@/contexts/golf-user-context';
import { AddClassModal, type ClassFormData } from '@/components/golf/classes/AddClassModal';
import { UploadScheduleModal } from '@/components/golf/classes/UploadScheduleModal';
import { ConfirmClassesModal } from '@/components/golf/classes/ConfirmClassesModal';
import { ClassDetailModal } from '@/components/golf/classes/ClassDetailModal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatTimeDisplay, formatDaysDisplay, generateClassColor, detectSemester, type ParsedClass } from '@/lib/utils/schedule-parser';
import { syncClassToCalendar, removeClassFromCalendar } from '@/app/golf/actions/calendar-sync';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayGolfClasses } from '@/components/fairway/pages/player-game';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';

// PlayerClass interface matches the actual golf_player_classes table schema
interface PlayerClass {
  id: string;
  player_id: string;
  class_name: string; // DB column is 'class_name' not 'course_name'
  instructor: string | null;
  days: string[] | null;
  start_time: string | null;
  end_time: string | null;
  building: string | null;
  room: string | null;
  credits: number | null;
  color: string | null;
  notes: string | null;
  team_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export default function GolfClassesPage() {
  const golfUser = useGolfUser();
  const { showToast } = useToast();
  const [classes, setClasses] = useState<PlayerClass[]>([]);
  const [loading, setLoading] = useState(true);

  // Use IDs from context
  const playerId = golfUser.playerId || null;
  const teamId = golfUser.teamId || null;

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [parsedClasses, setParsedClasses] = useState<ParsedClass[]>([]);
  const [selectedClass, setSelectedClass] = useState<PlayerClass | null>(null);
  const [editingClass, setEditingClass] = useState<ClassFormData | null>(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  const supabase = createClient();

  // Fetch classes on load
  useEffect(() => {
    fetchClasses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchClasses = async () => {
    if (!playerId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('golf_player_classes')
        .select('*')
        .eq('player_id', playerId)
        .order('start_time', { ascending: true });

      if (error) throw error;

      // Parse days from text to array if needed
      const processedClasses: PlayerClass[] = (data || []).map(cls => ({
        ...cls,
        days: Array.isArray(cls.days) ? cls.days : [],
      }));

      setClasses(processedClasses);
    } catch (_err) {
      showToast('Failed to load classes. Please refresh.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddClass = async (formData: ClassFormData) => {
    if (!playerId || !teamId) return;

    // Build class_name from course_code + course_name
    const className = formData.course_code
      ? `${formData.course_code} - ${formData.course_name}`
      : formData.course_name;

    const { data: newClass, error } = await supabase
      .from('golf_player_classes')
      .insert({
        player_id: playerId,
        team_id: teamId,
        class_name: className,
        instructor: formData.instructor || null,
        days: formData.days,
        // Store NULL (not a fabricated '00:00') when no time is given, so the
        // class reads as "no time set" everywhere instead of a phantom 12:00 AM
        // meeting — and the calendar sync skips creating a midnight event.
        start_time: formData.start_time || null,
        end_time: formData.end_time || null,
        building: formData.building || null,
        room: formData.room || null,
        credits: formData.credits,
        color: formData.color,
        notes: formData.notes || null,
        // Persist the term. It drives the calendar sync's occurrence window AND
        // bounds the availability fallback for a class that never synced —
        // without it a weekly class reads as busy forever, including over the
        // summer, so the fallback has to refuse to expand.
        semester: formData.semester || null,
      })
      .select()
      .single();

    if (error) {
      // Surface the failure (the modal swallows the throw to keep its state).
      showToast('Failed to add class. Please try again.', 'error');
      throw error;
    }

    // Sync to calendar (timezoneOffset so class times store as local wall-time,
    // matching the event timestamp convention — not UTC wall-time)
    if (newClass) {
      await syncClassToCalendar(
        { ...formData, timezoneOffset: new Date().getTimezoneOffset() },
        newClass.id, playerId, teamId,
      );
    }

    await fetchClasses();
    setShowAddModal(false);
    setEditingClass(null);
    fairwayToast.success('Class added', { description: 'Synced to your calendar.' });
  };

  const handleUpdateClass = async (formData: ClassFormData) => {
    if (!formData.id || !playerId || !teamId) return;

    // Build class_name from course_code + course_name
    const className = formData.course_code
      ? `${formData.course_code} - ${formData.course_name}`
      : formData.course_name;

    const { error } = await supabase
      .from('golf_player_classes')
      .update({
        class_name: className,
        instructor: formData.instructor || null,
        days: formData.days,
        // Store NULL (not '00:00') when no time is given — see handleAddClass.
        start_time: formData.start_time || null,
        end_time: formData.end_time || null,
        building: formData.building || null,
        room: formData.room || null,
        credits: formData.credits,
        color: formData.color,
        notes: formData.notes || null,
        semester: formData.semester || null,
      })
      .eq('id', formData.id)
      .eq('player_id', playerId);

    if (error) {
      // Surface the failure (the modal swallows the throw to keep its state).
      showToast('Failed to update class. Please try again.', 'error');
      throw error;
    }

    // Re-sync to calendar (diff-upserts the series)
    await syncClassToCalendar(
      { ...formData, timezoneOffset: new Date().getTimezoneOffset() },
      formData.id, playerId, teamId,
    );

    await fetchClasses();
    setShowAddModal(false);
    setEditingClass(null);
    setShowDetailModal(false);
    fairwayToast.success('Class updated', { description: 'Your calendar has been re-synced.' });
  };

  const handleDeleteClass = async () => {
    if (!selectedClass) return;

    // Remove from calendar first
    await removeClassFromCalendar(selectedClass.id);

    // Then delete the class
    const { error } = await supabase
      .from('golf_player_classes')
      .delete()
      .eq('id', selectedClass.id)
      .eq('player_id', playerId as string);

    if (error) {
      // Surface the failure (the detail modal swallows the throw to stay open).
      showToast('Failed to delete class. Please try again.', 'error');
      throw error;
    }

    await fetchClasses();
    setShowDetailModal(false);
    setSelectedClass(null);
    fairwayToast.success('Class deleted', { description: 'Removed from your schedule and calendar.' });
  };

  const handleParsedClasses = (parsed: ParsedClass[]) => {
    setParsedClasses(parsed);
    setShowUploadModal(false);
    setShowConfirmModal(true);
  };

  const handleConfirmClasses = async (confirmed: ParsedClass[]) => {
    if (!playerId) {
      showToast('Error: No player ID found. Please refresh the page.', 'error');
      return;
    }
    
    if (confirmed.length === 0) {
      return;
    }

    try {
      const classesToInsert = confirmed.map(cls => {
        // Build class_name from course_code + course_name
        const className = cls.course_code
          ? `${cls.course_code} - ${cls.course_name || 'Untitled Class'}`
          : cls.course_name || 'Untitled Class';
        return {
          player_id: playerId,
          team_id: teamId,
          class_name: className,
          instructor: cls.instructor || null,
          days: cls.days || [],
          // Store NULL (not '00:00') when no time is given — see handleAddClass.
          start_time: cls.start_time || null,
          end_time: cls.end_time || null,
          building: cls.building || null,
          room: cls.room || null,
          credits: cls.credits || null,
          color: cls.color || generateClassColor(),
          notes: null,
          // The vision parser derives the term from the screenshot — keep it
          // (see handleAddClass) instead of dropping it on the floor.
          semester: cls.semester || null,
        };
      });
      
      const { data, error } = await supabase
        .from('golf_player_classes')
        .insert(classesToInsert)
        .select();

      if (error) {
        showToast(`Error saving classes: ${error.message}`, 'error');
        throw error;
      }

      // Sync all classes to calendar in parallel
      if (data && teamId) {
        const syncPromises = data.map((insertedClass, i) => {
          const confirmedClass = confirmed[i];
          if (!insertedClass || !confirmedClass) return Promise.resolve();

          return syncClassToCalendar({
            id: insertedClass.id,
            course_code: confirmedClass.course_code || '',
            course_name: confirmedClass.course_name || confirmedClass.course_code || 'Untitled Class',
            instructor: confirmedClass.instructor || '',
            days: confirmedClass.days || [],
            start_time: confirmedClass.start_time || '',
            end_time: confirmedClass.end_time || '',
            location: confirmedClass.location || '',
            building: confirmedClass.building || '',
            room: confirmedClass.room || '',
            credits: confirmedClass.credits,
            semester: confirmedClass.semester || 'Spring 2026',
            semesterStartDate: confirmedClass.semesterStartDate,
            color: confirmedClass.color || generateClassColor(),
            notes: '',
            timezoneOffset: new Date().getTimezoneOffset(),
          }, insertedClass.id, playerId, teamId);
        });

        await Promise.all(syncPromises);
      }

      const importedCount = data?.length ?? confirmed.length;
      await fetchClasses();
      setShowConfirmModal(false);
      setParsedClasses([]);
      fairwayToast.success(
        `${importedCount} ${importedCount === 1 ? 'class' : 'classes'} imported`,
        { description: 'Synced to your calendar.' },
      );
    } catch {
      // Error handled by alert above
    }
  };

  const handleClassClick = (cls: PlayerClass) => {
    setSelectedClass(cls);
    setShowDetailModal(true);
  };

  const handleEditFromDetail = () => {
    if (!selectedClass) return;

    // Parse class_name back into course_code and course_name if it contains " - "
    let courseCode = '';
    let courseName = selectedClass.class_name;
    if (selectedClass.class_name.includes(' - ')) {
      const parts = selectedClass.class_name.split(' - ');
      courseCode = parts[0] || '';
      courseName = parts.slice(1).join(' - ') || selectedClass.class_name;
    }

    setEditingClass({
      id: selectedClass.id,
      course_code: courseCode,
      course_name: courseName,
      instructor: selectedClass.instructor || '',
      days: selectedClass.days || [],
      start_time: selectedClass.start_time || '',
      end_time: selectedClass.end_time || '',
      location: '', // Not stored in DB
      building: selectedClass.building || '',
      room: selectedClass.room || '',
      credits: selectedClass.credits,
      // semester is not persisted on golf_player_classes, so on edit we re-derive
      // the CURRENT term. detectSemester('') always returns a valid term string,
      // so the calendar re-sync produces valid dates. LATENT ISSUE (P231): a class
      // originally created for a DIFFERENT term gets its calendar events re-dated
      // to the current term on edit. The real fix requires persisting semester (or
      // semesterStartDate) on golf_player_classes — tracked separately; today this
      // is masked by most classes being current-term.
      semester: detectSemester(''),
      color: selectedClass.color || 'var(--color-primary-600)',
      notes: selectedClass.notes || '',
    });
    setShowDetailModal(false);
    setShowAddModal(true);
  };

  const handleDeleteAllClasses = () => {
    if (!playerId || classes.length === 0) return;
    setShowDeleteAllConfirm(true);
  };

  const confirmDeleteAllClasses = async () => {
    if (!playerId) return;
    setDeletingAll(true);
    try {
      // Delete all calendar events for these classes
      const classIds = classes.map(c => c.id);
      for (const classId of classIds) {
        await removeClassFromCalendar(classId);
      }

      // Delete all classes
      const { error } = await supabase
        .from('golf_player_classes')
        .delete()
        .eq('player_id', playerId);

      if (error) throw error;

      await fetchClasses();
      setShowDeleteAllConfirm(false);
      fairwayToast.success('All classes deleted', { description: 'Your schedule and calendar are clear.' });
    } catch (_err) {
      showToast('Error deleting classes. Please try again.', 'error');
    } finally {
      setDeletingAll(false);
    }
  };

  // Group classes by day for schedule view
  const classesByDay = classes.reduce((acc, cls) => {
    (cls.days || []).forEach(day => {
      if (!acc[day]) acc[day] = [];
      acc[day].push(cls);
    });
    return acc;
  }, {} as Record<string, PlayerClass[]>);

  // Sort classes by time within each day
  Object.keys(classesByDay).forEach(day => {
    classesByDay[day]?.sort((a, b) => {
      if (!a.start_time) return 1;
      if (!b.start_time) return -1;
      return a.start_time.localeCompare(b.start_time);
    });
  });

  // Helper to parse class_name into code and name parts for display
  const parseClassName = (className: string): { code: string; name: string } => {
    if (className.includes(' - ')) {
      const parts = className.split(' - ');
      return {
        code: parts[0] || '',
        name: parts.slice(1).join(' - ') || className,
      };
    }
    return { code: '', name: className };
  };

  // Helper to get location display (combine building and room)
  const getLocationDisplay = (cls: PlayerClass): string | null => {
    if (cls.building && cls.room) return `${cls.building} ${cls.room}`;
    if (cls.building) return cls.building;
    if (cls.room) return cls.room;
    return null;
  };

  // Calculate total credits
  const totalCredits = classes.reduce((sum, cls) => sum + (cls.credits ?? 0), 0);

  // Presentation-only Fairway surface. Reuses the SAME state + verbatim
  // handlers (the golf_player_classes writes + calendar-sync actions are
  // untouched). `isWrongRole`/`hasTeam` are the ONLY guards for this route —
  // Fairway is the only tree (Wave W1).
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayGolfClasses
        classes={classes}
        loading={loading}
        isWrongRole={golfUser.role !== 'player'}
        hasTeam={Boolean(teamId)}
        classesByDay={classesByDay}
        totalCredits={totalCredits}
        parseClassName={parseClassName}
        getLocationDisplay={getLocationDisplay}
        formatTimeDisplay={formatTimeDisplay}
        formatDaysDisplay={formatDaysDisplay}
        onAddClass={() => { setEditingClass(null); setShowAddModal(true); }}
        onImportSchedule={() => setShowUploadModal(true)}
        onClassClick={handleClassClick}
        onDeleteAll={handleDeleteAllClasses}
      />

      <AddClassModal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); setEditingClass(null); }}
        onSave={editingClass?.id ? handleUpdateClass : handleAddClass}
        editingClass={editingClass}
        existingClasses={classes.map(cls => ({
          id: cls.id,
          days: cls.days,
          start_time: cls.start_time,
          end_time: cls.end_time,
          class_name: cls.class_name,
        }))}
      />

      <UploadScheduleModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onParsed={handleParsedClasses}
      />

      <ConfirmClassesModal
        isOpen={showConfirmModal}
        onClose={() => { setShowConfirmModal(false); setParsedClasses([]); }}
        onConfirm={handleConfirmClasses}
        parsedClasses={parsedClasses}
      />

      <ConfirmDialog
        open={showDeleteAllConfirm}
        title="Delete all classes?"
        message={`This will remove all ${classes.length} class${classes.length === 1 ? '' : 'es'} from your schedule and your calendar. This action cannot be undone.`}
        confirmLabel="Delete All"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deletingAll}
        onConfirm={confirmDeleteAllClasses}
        onCancel={() => setShowDeleteAllConfirm(false)}
      />

      <ClassDetailModal
        isOpen={showDetailModal}
        onClose={() => { setShowDetailModal(false); setSelectedClass(null); }}
        onEdit={handleEditFromDetail}
        onDelete={handleDeleteClass}
        classData={selectedClass ? (() => {
          const { code, name } = parseClassName(selectedClass.class_name);
          const location = getLocationDisplay(selectedClass);
          return {
            ...selectedClass,
            course_code: code,
            course_name: name,
            instructor: selectedClass.instructor || '',
            days: selectedClass.days || [],
            start_time: selectedClass.start_time || '',
            end_time: selectedClass.end_time || '',
            location: location || '',
            building: selectedClass.building || '',
            room: selectedClass.room || '',
            credits: selectedClass.credits,
            semester: '', // Not stored in DB
            color: selectedClass.color || 'var(--color-primary-600)',
            notes: selectedClass.notes || '',
          };
        })() : null}
      />
    </div>
  );
}
