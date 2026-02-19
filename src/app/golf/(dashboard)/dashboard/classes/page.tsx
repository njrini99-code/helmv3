'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconBook, IconPlus, IconUpload, IconClock, IconMapPin, IconCalendar } from '@/components/icons';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { createClient } from '@/lib/supabase/client';
import { useGolfUser } from '@/contexts/golf-user-context';
import { AddClassModal, type ClassFormData } from '@/components/golf/classes/AddClassModal';
import { UploadScheduleModal } from '@/components/golf/classes/UploadScheduleModal';
import { ConfirmClassesModal } from '@/components/golf/classes/ConfirmClassesModal';
import { ClassDetailModal } from '@/components/golf/classes/ClassDetailModal';
import { MobileMenuButton } from '@/components/golf/layout/MobileMenuButton';
import { formatTimeDisplay, formatDaysDisplay, generateClassColor, type ParsedClass } from '@/lib/utils/schedule-parser';
import { syncClassToCalendar, removeClassFromCalendar } from '@/app/golf/actions/calendar-sync';

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
    } catch (err) {
      console.error('[GolfHelm] Error loading classes:', err);
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
        start_time: formData.start_time || '00:00',
        end_time: formData.end_time || '00:00',
        building: formData.building || null,
        room: formData.room || null,
        credits: formData.credits,
        color: formData.color,
        notes: formData.notes || null,
      })
      .select()
      .single();

    if (error) throw error;

    // Sync to calendar
    if (newClass) {
      await syncClassToCalendar(formData, newClass.id, playerId, teamId);
    }

    await fetchClasses();
    setShowAddModal(false);
    setEditingClass(null);
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
        start_time: formData.start_time || '00:00',
        end_time: formData.end_time || '00:00',
        building: formData.building || null,
        room: formData.room || null,
        credits: formData.credits,
        color: formData.color,
        notes: formData.notes || null,
      })
      .eq('id', formData.id);

    if (error) throw error;

    // Re-sync to calendar (deletes old events and creates new ones)
    await syncClassToCalendar(formData, formData.id, playerId, teamId);

    await fetchClasses();
    setShowAddModal(false);
    setEditingClass(null);
    setShowDetailModal(false);
  };

  const handleDeleteClass = async () => {
    if (!selectedClass) return;

    // Remove from calendar first
    await removeClassFromCalendar(selectedClass.id);

    // Then delete the class
    const { error } = await supabase
      .from('golf_player_classes')
      .delete()
      .eq('id', selectedClass.id);

    if (error) throw error;

    await fetchClasses();
    setShowDetailModal(false);
    setSelectedClass(null);
  };

  const handleParsedClasses = (parsed: ParsedClass[]) => {
    setParsedClasses(parsed);
    setShowUploadModal(false);
    setShowConfirmModal(true);
  };

  const handleConfirmClasses = async (confirmed: ParsedClass[]) => {
    if (!playerId) {
      alert('Error: No player ID found. Please refresh the page.');
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
          start_time: cls.start_time || '00:00',
          end_time: cls.end_time || '00:00',
          building: cls.building || null,
          room: cls.room || null,
          credits: cls.credits || null,
          color: cls.color || generateClassColor(),
          notes: null,
        };
      });
      
      const { data, error } = await supabase
        .from('golf_player_classes')
        .insert(classesToInsert)
        .select();

      if (error) {
        alert(`Error saving classes: ${error.message}`);
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
          }, insertedClass.id, playerId, teamId);
        });

        await Promise.all(syncPromises);
      }

      await fetchClasses();
      setShowConfirmModal(false);
      setParsedClasses([]);
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
      semester: '', // Not stored in DB
      color: selectedClass.color || '#16A34A',
      notes: selectedClass.notes || '',
    });
    setShowDetailModal(false);
    setShowAddModal(true);
  };

  const handleDeleteAllClasses = async () => {
    if (!playerId) return;

    const confirmDelete = confirm(
      `Are you sure you want to delete all ${classes.length} classes? This will also remove them from your calendar. This action cannot be undone.`
    );

    if (!confirmDelete) return;

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
    } catch (err) {
      console.error('[GolfHelm] Error deleting class:', err);
      alert('Error deleting classes. Please try again.');
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

  const dayOrder = ['M', 'T', 'W', 'Th', 'F'];
  const dayNames: Record<string, string> = {
    M: 'Monday',
    T: 'Tuesday',
    W: 'Wednesday',
    Th: 'Thursday',
    F: 'Friday',
  };

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
  const totalCredits = classes.reduce((sum, cls) => sum + (cls.credits || 0), 0);

  // No team — show helpful empty state instead of silently failing on add/edit
  if (!teamId) {
    return (
      <AnimatedPage className="p-4 md:p-6 max-w-7xl mx-auto">
        <AnimatedItem className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <IconBook size={32} className="text-amber-500" />
            </div>
            <h2 className="text-xl font-semibold text-warm-900 mb-2">Join a Team First</h2>
            <p className="text-warm-500 mb-6">
              You need to be on a team before you can add your class schedule. Ask your coach for a join code.
            </p>
            <a
              href="/golf/join"
              className="inline-block px-6 py-2.5 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              Join a Team
            </a>
          </div>
        </AnimatedItem>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <AnimatedItem className="mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <MobileMenuButton />
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-warm-900 truncate">My Classes</h1>
              <p className="text-warm-500 mt-1 text-sm md:text-base truncate">
                {classes.length > 0
                  ? `${classes.length} class${classes.length !== 1 ? 'es' : ''} • ${totalCredits} credits`
                  : 'Academic schedule'
                }
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:justify-end">
            {classes.length > 0 && (
              <Button
                variant="danger"
                onClick={handleDeleteAllClasses}
                className="gap-2"
              >
                Delete All
              </Button>
            )}
            <Button variant="secondary" onClick={() => setShowUploadModal(true)} className="gap-2">
              <IconUpload size={18} />
              Import Schedule
            </Button>
            <Button onClick={() => { setEditingClass(null); setShowAddModal(true); }} className="gap-2">
              <IconPlus size={18} />
              Add Class
            </Button>
          </div>
        </div>
      </AnimatedItem>

      <AnimatedItem>
      {loading ? (
        <Card variant="glass">
          <CardContent className="py-12 text-center">
            <div className="space-y-3 w-48 mx-auto">
              <div className="h-4 w-full bg-warm-200 rounded skeleton-shimmer" />
              <div className="h-4 w-3/4 bg-warm-200 rounded skeleton-shimmer" />
              <div className="h-4 w-1/2 bg-warm-200 rounded skeleton-shimmer" />
            </div>
            <p className="text-warm-500 mt-4">Loading classes...</p>
          </CardContent>
        </Card>
      ) : classes.length === 0 ? (
        /* Empty State */
        <Card variant="glass">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
              <IconBook size={32} className="text-warm-300" />
            </div>
            <h3 className="text-lg font-medium text-warm-900 mb-2">
              No Classes Added
            </h3>
            <p className="text-warm-500 mb-6 max-w-md mx-auto">
              Add your class schedule to help your coaches plan practices around your academic commitments
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="secondary" onClick={() => setShowUploadModal(true)} className="gap-2">
                <IconUpload size={18} />
                Import Schedule
              </Button>
              <Button onClick={() => setShowAddModal(true)} className="gap-2">
                <IconPlus size={18} />
                Add First Class
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Schedule View */
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card variant="glass" className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                  <IconBook size={20} className="text-primary-600" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-warm-900">{classes.length}</p>
                  <p className="text-xs text-warm-500">Classes</p>
                </div>
              </div>
            </Card>
            <Card variant="glass" className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-warm-50 flex items-center justify-center">
                  <IconCalendar size={20} className="text-warm-600" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-warm-900">{totalCredits}</p>
                  <p className="text-xs text-warm-500">Credits</p>
                </div>
              </div>
            </Card>
            <Card variant="glass" className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-warm-50 flex items-center justify-center">
                  <IconClock size={20} className="text-warm-600" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-warm-900">
                    {Object.keys(classesByDay).length}
                  </p>
                  <p className="text-xs text-warm-500">Days/Week</p>
                </div>
              </div>
            </Card>
            <Card variant="glass" className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                  <IconMapPin size={20} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-warm-900">
                    {classes && classes.length > 0
                      ? new Set(classes.map(c => c.building).filter(Boolean)).size
                      : 0}
                  </p>
                  <p className="text-xs text-warm-500">Buildings</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Schedule Grid */}
          <Card variant="glass">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-warm-900 mb-4">Weekly Schedule</h2>

              {Object.keys(classesByDay).length > 0 ? (
                <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-2 px-2 md:grid md:grid-cols-5 md:gap-4 md:overflow-x-visible md:snap-none md:pb-0 md:mx-0 md:px-0" style={{ WebkitOverflowScrolling: 'touch' }}>
                  {dayOrder.map(day => (
                    <div key={day} className="min-w-[70vw] snap-center flex-shrink-0 md:min-w-0 md:flex-shrink">
                      <div className="text-center mb-3">
                        <span className="text-sm font-medium text-warm-500">{dayNames[day]}</span>
                      </div>
                      <div className="space-y-2 min-h-[200px]">
                        {classesByDay[day] && classesByDay[day].length > 0 ? (
                          classesByDay[day]!.map(cls => {
                            const { code, name } = parseClassName(cls.class_name);
                            const location = getLocationDisplay(cls);
                            return (
                              <button
                                key={`${cls.id}-${day}`}
                                onClick={() => handleClassClick(cls)}
                                className="w-full text-left p-3 min-h-[64px] rounded-xl border border-white/20 hover:border-white/40 hover:shadow-glass-sm active:bg-warm-50 transition-all bg-white/60 backdrop-blur-sm"
                                style={{ borderLeftColor: cls.color || '#16A34A', borderLeftWidth: '3px' }}
                              >
                                {code && (
                                  <p className="font-mono text-xs font-semibold text-primary-600 mb-0.5">
                                    {code}
                                  </p>
                                )}
                                <p className="text-sm font-medium text-warm-900 truncate">
                                  {name}
                                </p>
                                {cls.start_time && (
                                  <p className="text-xs text-warm-500 mt-1">
                                    {formatTimeDisplay(cls.start_time)}
                                    {cls.end_time && ` - ${formatTimeDisplay(cls.end_time)}`}
                                  </p>
                                )}
                                {location && (
                                  <p className="text-xs text-warm-400 mt-0.5">{location}</p>
                                )}
                              </button>
                            );
                          })
                        ) : (
                          <div className="h-full flex items-center justify-center text-xs text-warm-300 py-8">
                            No classes
                          </div>
                        )}
                      </div>
                  </div>
                ))}
              </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mb-3">
                    <IconCalendar size={24} className="text-warm-400" />
                  </div>
                  <p className="text-sm text-warm-500">No scheduled classes this week</p>
                </div>
              )}
            </div>
          </Card>

          {/* All Classes List */}
          <Card variant="glass">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-warm-900 mb-4">All Classes</h2>

              <div className="space-y-3">
                {classes && classes.length > 0 ? classes.map(cls => {
                  const { code, name } = parseClassName(cls.class_name);
                  const location = getLocationDisplay(cls);
                  return (
                    <button
                      key={cls.id}
                      onClick={() => handleClassClick(cls)}
                      className="w-full text-left p-4 min-h-[72px] rounded-xl border border-warm-200 hover:border-warm-300 hover:shadow-sm active:bg-warm-50 transition-all bg-white flex items-center gap-4"
                    >
                      <div
                        className="w-2 h-12 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cls.color || '#16A34A' }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {code && (
                            <span className="font-mono text-sm font-semibold text-primary-600">
                              {code}
                            </span>
                          )}
                          <span className="text-warm-900 font-medium truncate">
                            {name}
                          </span>
                          {cls.credits && (
                            <span className="px-2 py-0.5 bg-warm-100 rounded text-xs text-warm-500 flex-shrink-0">
                              {cls.credits} cr
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-warm-500">
                          {(cls.days || []).length > 0 && (
                            <span className="font-medium">
                              {formatDaysDisplay(cls.days || [])}
                            </span>
                          )}
                          {cls.start_time && cls.end_time && (
                            <span>
                              {formatTimeDisplay(cls.start_time)} - {formatTimeDisplay(cls.end_time)}
                            </span>
                          )}
                          {location && (
                            <span className="flex items-center gap-1">
                              <IconMapPin size={14} />
                              {location}
                            </span>
                          )}
                          {cls.instructor && (
                            <span className="text-warm-400">{cls.instructor}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                }) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mb-3">
                      <IconBook size={24} className="text-warm-400" />
                    </div>
                    <p className="text-sm text-warm-500">No classes to display</p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
      </AnimatedItem>

      {/* Modals */}
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
            color: selectedClass.color || '#16A34A',
            notes: selectedClass.notes || '',
          };
        })() : null}
      />
    </AnimatedPage>
  );
}
