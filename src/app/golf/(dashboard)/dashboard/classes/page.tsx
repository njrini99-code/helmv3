'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconBook, IconPlus, IconUpload, IconClock, IconMapPin, IconCalendar } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';
import { AddClassModal, type ClassFormData } from '@/components/golf/classes/AddClassModal';
import { UploadScheduleModal } from '@/components/golf/classes/UploadScheduleModal';
import { ConfirmClassesModal } from '@/components/golf/classes/ConfirmClassesModal';
import { ClassDetailModal } from '@/components/golf/classes/ClassDetailModal';
import { formatTimeDisplay, formatDaysDisplay, generateClassColor, type ParsedClass } from '@/lib/utils/schedule-parser';
import { syncClassToCalendar, removeClassFromCalendar } from '@/app/golf/actions/calendar-sync';

interface PlayerClass {
  id: string;
  player_id: string;
  course_code: string | null;
  course_name: string;
  instructor: string | null;
  days: string[];
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  building: string | null;
  room: string | null;
  credits: number | null;
  semester: string | null;
  color: string | null;
  notes: string | null;
  day_of_week: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export default function GolfClassesPage() {
  const [classes, setClasses] = useState<PlayerClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);

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
  }, []);

  const fetchClasses = async () => {
    setLoading(true);
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get player ID and team ID
      const { data: player } = await supabase
        .from('golf_players')
        .select('id, team_id')
        .eq('user_id', user.id)
        .single();

      if (!player) return;
      setPlayerId(player.id);
      setTeamId(player.team_id);

      // Fetch classes
      const { data, error } = await supabase
        .from('golf_player_classes')
        .select('*')
        .eq('player_id', player.id)
        .order('start_time', { ascending: true });

      if (error) throw error;
      
      // Parse days from text to array if needed
      const processedClasses: PlayerClass[] = (data || []).map(cls => ({
        ...cls,
        days: Array.isArray(cls.days) ? cls.days : [],
        day_of_week: cls.day_of_week || null,
      }));

      setClasses(processedClasses);
    } catch {
      // Error handled silently - classes will show empty state
    } finally {
      setLoading(false);
    }
  };

  const handleAddClass = async (formData: ClassFormData) => {
    if (!playerId || !teamId) return;

    const { data: newClass, error } = await supabase
      .from('golf_player_classes')
      .insert({
        player_id: playerId,
        course_code: formData.course_code,
        course_name: formData.course_name,
        instructor: formData.instructor || null,
        days: formData.days,
        day_of_week: 0, // Deprecated, using days array instead
        start_time: formData.start_time || '00:00',
        end_time: formData.end_time || '00:00',
        location: formData.location || null,
        building: formData.building || null,
        room: formData.room || null,
        credits: formData.credits,
        semester: formData.semester,
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

    const { error } = await supabase
      .from('golf_player_classes')
      .update({
        course_code: formData.course_code,
        course_name: formData.course_name,
        instructor: formData.instructor || null,
        days: formData.days,
        day_of_week: 0, // Deprecated, using days array instead
        start_time: formData.start_time || '00:00',
        end_time: formData.end_time || '00:00',
        location: formData.location || null,
        building: formData.building || null,
        room: formData.room || null,
        credits: formData.credits,
        semester: formData.semester,
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
      const classesToInsert = confirmed.map(cls => ({
        player_id: playerId,
        course_code: cls.course_code || 'UNKNOWN',
        course_name: cls.course_name || cls.course_code || 'Untitled Class',
        instructor: cls.instructor || null,
        days: cls.days || [],
        day_of_week: 0, // Deprecated, using days array instead
        start_time: cls.start_time || '00:00',
        end_time: cls.end_time || '00:00',
        location: cls.location || null,
        building: cls.building || null,
        room: cls.room || null,
        credits: cls.credits || null,
        semester: cls.semester || 'Fall 2025',
        color: cls.color || generateClassColor(),
        notes: null,
      }));
      
      const { data, error } = await supabase
        .from('golf_player_classes')
        .insert(classesToInsert)
        .select();

      if (error) {
        alert(`Error saving classes: ${error.message}`);
        throw error;
      }

      // Sync all classes to calendar
      if (data && teamId) {
        for (let i = 0; i < data.length; i++) {
          const insertedClass = data[i];
          const confirmedClass = confirmed[i];

          if (insertedClass && confirmedClass) {
            try {
              await syncClassToCalendar({
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
                semester: confirmedClass.semester || 'Fall 2025',
                semesterStartDate: confirmedClass.semesterStartDate, // Custom start date from modal
                color: confirmedClass.color || generateClassColor(),
                notes: '',
              }, insertedClass.id, playerId, teamId);
            } catch {
              // Calendar sync error - continue with other classes
            }
          }
        }
      }

      await fetchClasses();
      setShowConfirmModal(false);
      setParsedClasses([]);
    } catch {
      // Error already handled with alert
    }
  };

  const handleClassClick = (cls: PlayerClass) => {
    setSelectedClass(cls);
    setShowDetailModal(true);
  };

  const handleEditFromDetail = () => {
    if (!selectedClass) return;

    setEditingClass({
      id: selectedClass.id,
      course_code: selectedClass.course_code || '',
      course_name: selectedClass.course_name,
      instructor: selectedClass.instructor || '',
      days: selectedClass.days || [],
      start_time: selectedClass.start_time || '',
      end_time: selectedClass.end_time || '',
      location: selectedClass.location || '',
      building: selectedClass.building || '',
      room: selectedClass.room || '',
      credits: selectedClass.credits,
      semester: selectedClass.semester || '',
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
    } catch {
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

  // Calculate total credits
  const totalCredits = classes.reduce((sum, cls) => sum + (cls.credits || 0), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My Classes</h1>
          <p className="text-slate-500 mt-1">
            {classes.length > 0 
              ? `${classes.length} class${classes.length !== 1 ? 'es' : ''} • ${totalCredits} credits`
              : 'Academic schedule'
            }
          </p>
        </div>
        <div className="flex items-center gap-3">
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

      {loading ? (
        <Card variant="glass">
          <CardContent className="py-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto" />
            <p className="text-slate-500 mt-4">Loading classes...</p>
          </CardContent>
        </Card>
      ) : classes.length === 0 ? (
        /* Empty State */
        <Card variant="glass">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <IconBook size={32} className="text-slate-300" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              No Classes Added
            </h3>
            <p className="text-slate-500 mb-6 max-w-md mx-auto">
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
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                  <IconBook size={20} className="text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-slate-900">{classes.length}</p>
                  <p className="text-xs text-slate-500">Classes</p>
                </div>
              </div>
            </Card>
            <Card variant="glass" className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
                  <IconCalendar size={20} className="text-slate-600" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-slate-900">{totalCredits}</p>
                  <p className="text-xs text-slate-500">Credits</p>
                </div>
              </div>
            </Card>
            <Card variant="glass" className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
                  <IconClock size={20} className="text-slate-600" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-slate-900">
                    {Object.keys(classesByDay).length}
                  </p>
                  <p className="text-xs text-slate-500">Days/Week</p>
                </div>
              </div>
            </Card>
            <Card variant="glass" className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                  <IconMapPin size={20} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-slate-900">
                    {classes && classes.length > 0
                      ? new Set(classes.map(c => c.building).filter(Boolean)).size
                      : 0}
                  </p>
                  <p className="text-xs text-slate-500">Buildings</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Schedule Grid */}
          <Card variant="glass">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Weekly Schedule</h2>

              {Object.keys(classesByDay).length > 0 ? (
                <div className="grid grid-cols-5 gap-4">
                  {dayOrder.map(day => (
                    <div key={day}>
                      <div className="text-center mb-3">
                        <span className="text-sm font-medium text-slate-500">{dayNames[day]}</span>
                      </div>
                      <div className="space-y-2 min-h-[200px]">
                        {classesByDay[day] && classesByDay[day].length > 0 ? (
                          classesByDay[day]!.map(cls => (
                            <button
                              key={`${cls.id}-${day}`}
                              onClick={() => handleClassClick(cls)}
                              className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all bg-white"
                              style={{ borderLeftColor: cls.color || '#16A34A', borderLeftWidth: '3px' }}
                            >
                              <p className="font-mono text-xs font-semibold text-green-600 mb-0.5">
                                {cls.course_code}
                              </p>
                              <p className="text-sm font-medium text-slate-900 truncate">
                                {cls.course_name}
                              </p>
                              {cls.start_time && (
                                <p className="text-xs text-slate-500 mt-1">
                                  {formatTimeDisplay(cls.start_time)}
                                  {cls.end_time && ` - ${formatTimeDisplay(cls.end_time)}`}
                                </p>
                              )}
                              {cls.location && (
                                <p className="text-xs text-slate-400 mt-0.5">{cls.location}</p>
                              )}
                            </button>
                          ))
                        ) : (
                          <div className="h-full flex items-center justify-center text-xs text-slate-300 py-8">
                            No classes
                          </div>
                        )}
                      </div>
                  </div>
                ))}
              </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                    <IconCalendar size={24} className="text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-500">No scheduled classes this week</p>
                </div>
              )}
            </div>
          </Card>

          {/* All Classes List */}
          <Card variant="glass">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">All Classes</h2>

              <div className="space-y-3">
                {classes && classes.length > 0 ? classes.map(cls => (
                  <button
                    key={cls.id}
                    onClick={() => handleClassClick(cls)}
                    className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all bg-white flex items-center gap-4"
                  >
                    <div 
                      className="w-2 h-12 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cls.color || '#16A34A' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-semibold text-green-600">
                          {cls.course_code}
                        </span>
                        <span className="text-slate-900 font-medium truncate">
                          {cls.course_name}
                        </span>
                        {cls.credits && (
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-500 flex-shrink-0">
                            {cls.credits} cr
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-slate-500">
                        {(cls.days || []).length > 0 && (
                          <span className="font-medium">
                            {formatDaysDisplay(cls.days)}
                          </span>
                        )}
                        {cls.start_time && cls.end_time && (
                          <span>
                            {formatTimeDisplay(cls.start_time)} - {formatTimeDisplay(cls.end_time)}
                          </span>
                        )}
                        {cls.location && (
                          <span className="flex items-center gap-1">
                            <IconMapPin size={14} />
                            {cls.location}
                          </span>
                        )}
                        {cls.instructor && (
                          <span className="text-slate-400">{cls.instructor}</span>
                        )}
                      </div>
                    </div>
                  </button>
                )) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                      <IconBook size={24} className="text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-500">No classes to display</p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Modals */}
      <AddClassModal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); setEditingClass(null); }}
        onSave={editingClass?.id ? handleUpdateClass : handleAddClass}
        editingClass={editingClass}
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
        classData={selectedClass ? {
          ...selectedClass,
          course_code: selectedClass.course_code || '',
          instructor: selectedClass.instructor || '',
          days: selectedClass.days || [],
          start_time: selectedClass.start_time || '',
          end_time: selectedClass.end_time || '',
          location: selectedClass.location || '',
          building: selectedClass.building || '',
          room: selectedClass.room || '',
          credits: selectedClass.credits,
          semester: selectedClass.semester || '',
          color: selectedClass.color || '#16A34A',
          notes: selectedClass.notes || '',
        } : null}
      />
    </div>
  );
}
