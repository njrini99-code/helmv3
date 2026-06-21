'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { CourseImage } from './CourseImage';
import { CourseFormDrawer } from './CourseFormDrawer';
import { TeeFormDrawer } from './TeeFormDrawer';
import { Button } from '@/components/fairway/controls/button';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/sonner';
import {
  IconX, IconMapPin, IconFlag, IconPlus, IconPencil, IconStar, IconUpload, IconTrash, IconCheck,
} from '@/components/icons';
import {
  getCourseDetail, getTeeWithHoles, saveTeamCourse, unsaveTeamCourse,
  setCourseImageUrl, removeCourseImage, setTeamCoursePinned, setTeamCourseDefaultTee,
  softDeleteCourse, softDeleteTee,
} from '@/app/golf/actions/course-library';
import { uploadCourseImage } from '@/lib/golf/upload-course-image';
import type {
  GolfCourse, GolfCourseTee, GolfCourseTeeWithHoles, GolfTeamSavedCourseWithCourse,
} from '@/lib/types/golf-course';

export interface CourseDetailDrawerProps {
  courseId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManageTeam: boolean;
  savedCourseIds: Set<string>;
  /** Saved-course rows keyed by course id — supplies pin + default-tee state. */
  savedById?: Map<string, GolfTeamSavedCourseWithCourse>;
  onChanged?: () => void;
}

const CATEGORY_LABEL: Record<string, string> = {
  mens: "Men's", womens: "Women's", tournament: 'Tournament', mixed: 'Mixed',
  senior: 'Senior', junior: 'Junior', custom: 'Custom',
};

export function CourseDetailDrawer({
  courseId, open, onOpenChange, canManageTeam, savedCourseIds, savedById, onChanged,
}: CourseDetailDrawerProps) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [detail, setDetail] = useState<{ course: GolfCourse; tees: GolfCourseTee[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [editCourseOpen, setEditCourseOpen] = useState(false);
  const [teeForm, setTeeForm] = useState<{ open: boolean; mode: 'create' | 'edit'; tee?: GolfCourseTeeWithHoles }>({ open: false, mode: 'create' });
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  // Destructive confirmations (Nielsen #5 error prevention): photo removal,
  // tee-set deletion, and whole-course removal each route through ConfirmDialog.
  const [removePhotoConfirm, setRemovePhotoConfirm] = useState(false);
  const [deleteTee, setDeleteTee] = useState<{ id: string; name: string } | null>(null);
  const [deleteCourseConfirm, setDeleteCourseConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isSaved = courseId ? savedCourseIds.has(courseId) : false;
  const savedRow = courseId ? savedById?.get(courseId) : undefined;

  // Optimistic mirrors of the saved-course state so pin/default-tee feel instant;
  // they re-sync to the server row whenever the drawer (re)opens on a course.
  const [pinned, setPinned] = useState(false);
  const [defaultTeeId, setDefaultTeeId] = useState<string | null>(null);
  const [pinPending, setPinPending] = useState(false);
  const [defaultTeePending, setDefaultTeePending] = useState<string | null>(null);

  useEffect(() => {
    setPinned(savedRow?.pinned ?? false);
    setDefaultTeeId(savedRow?.default_tee_id ?? null);
  }, [savedRow]);

  const reload = async (id: string) => {
    const d = await getCourseDetail(id);
    setDetail(d);
  };

  const loadDetail = (id: string) => {
    setLoading(true);
    setLoadError(false);
    setDetail(null);
    getCourseDetail(id)
      .then((d) => setDetail(d))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open || !courseId) return;
    loadDetail(courseId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, courseId]);

  const afterMutation = async () => {
    if (courseId) await reload(courseId);
    onChanged?.();
  };

  const handleImagePick = async (file: File) => {
    if (!courseId) return;
    setUploading(true);
    try {
      const up = await uploadCourseImage(courseId, file);
      if (!up.ok) { showToast(up.error, 'error'); return; }
      const res = await setCourseImageUrl(courseId, up.url);
      if (!res.success) { showToast(res.error, 'error'); return; }
      showToast('Photo updated', 'success');
      await afterMutation();
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = () => {
    if (!courseId) return;
    setRemovePhotoConfirm(false);
    startTransition(async () => {
      const res = await removeCourseImage(courseId);
      if (!res.success) { showToast(res.error, 'error'); return; }
      showToast('Photo removed', 'success');
      await afterMutation();
    });
  };

  const handleDeleteTee = () => {
    if (!deleteTee) return;
    const teeId = deleteTee.id;
    setDeleting(true);
    startTransition(async () => {
      const res = await softDeleteTee(teeId);
      setDeleting(false);
      setDeleteTee(null);
      if (!res.success) { showToast(res.error, 'error'); return; }
      showToast('Tee set removed', 'success');
      await afterMutation();
    });
  };

  const handleDeleteCourse = () => {
    if (!courseId) return;
    const id = courseId;
    setDeleting(true);
    startTransition(async () => {
      const res = await softDeleteCourse(id);
      setDeleting(false);
      setDeleteCourseConfirm(false);
      if (!res.success) { showToast(res.error, 'error'); return; }
      showToast('Course removed', 'success');
      onChanged?.();
      onOpenChange(false);
    });
  };

  const handleToggleSave = () => {
    if (!courseId) return;
    startTransition(async () => {
      const res = isSaved ? await unsaveTeamCourse(courseId) : await saveTeamCourse(courseId);
      if (!res.success) { showToast(res.error, 'error'); return; }
      showToast(isSaved ? 'Removed from team library' : 'Saved to team library', 'success');
      onChanged?.();
    });
  };

  const handleTogglePin = () => {
    if (!courseId) return;
    const next = !pinned;
    setPinned(next); // optimistic
    setPinPending(true);
    startTransition(async () => {
      const res = await setTeamCoursePinned(courseId, next);
      if (!res.success) {
        setPinned(!next); // roll back
        showToast(res.error, 'error');
      } else {
        showToast(next ? 'Pinned to the top' : 'Unpinned', 'success');
        onChanged?.();
      }
      setPinPending(false);
    });
  };

  const handleSetDefaultTee = (teeId: string) => {
    if (!courseId) return;
    // Toggle off if it's already the default.
    const next = defaultTeeId === teeId ? null : teeId;
    const prev = defaultTeeId;
    setDefaultTeeId(next); // optimistic
    setDefaultTeePending(teeId);
    startTransition(async () => {
      const res = await setTeamCourseDefaultTee(courseId, next);
      if (!res.success) {
        setDefaultTeeId(prev); // roll back
        showToast(res.error, 'error');
      } else {
        showToast(next ? 'Set as team default tee' : 'Cleared default tee', 'success');
        onChanged?.();
      }
      setDefaultTeePending(null);
    });
  };

  const handleEditTee = async (teeId: string) => {
    const tee = await getTeeWithHoles(teeId);
    if (!tee) { showToast('Could not load that tee', 'error'); return; }
    setTeeForm({ open: true, mode: 'edit', tee });
  };

  const course = detail?.course;
  const tees = detail?.tees ?? [];
  const location = course ? [course.city, course.state].filter(Boolean).join(', ') : '';

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="sm:mx-auto sm:max-w-2xl sm:rounded-fw-lg">
          <DrawerTitle className="sr-only">{course?.name ?? 'Course details'}</DrawerTitle>

          <div className="max-h-[88vh] overflow-y-auto">
            {/* Hero */}
            <div className="relative aspect-[2/1] w-full">
              <CourseImage name={course?.name ?? '…'} imageUrl={course?.image_url} scrim priority />
              {/* close */}
              {/* eslint-disable-next-line helm/no-raw-button -- glass overlay control on the hero image */}
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-colors hover:bg-black/50"
              >
                <IconX size={18} aria-hidden />
              </button>
              {/* photo controls */}
              <div className="absolute left-3 top-3 flex gap-2">
                {/* eslint-disable-next-line helm/no-raw-button -- glass overlay control on the hero image */}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading || !course}
                  className="inline-flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1.5 text-caption font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/50 disabled:opacity-60"
                >
                  <IconUpload size={13} aria-hidden /> {uploading ? 'Uploading…' : course?.image_url ? 'Replace' : 'Add photo'}
                </button>
                {course?.image_url && (
                  // eslint-disable-next-line helm/no-raw-button -- glass overlay control on the hero image
                  <button
                    type="button"
                    onClick={() => setRemovePhotoConfirm(true)}
                    disabled={pending}
                    aria-label="Remove photo"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-colors hover:bg-black/50 disabled:opacity-60"
                  >
                    <IconTrash size={13} aria-hidden />
                  </button>
                )}
              </div>
              {/* eslint-disable-next-line helm/no-raw-input -- hidden native file picker (no design-system equivalent) */}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImagePick(f);
                  e.target.value = '';
                }}
              />
              {/* title overlay */}
              <div className="absolute inset-x-0 bottom-0 p-5">
                <h2 className="font-fw-display text-title-2 font-semibold tracking-tight text-white drop-shadow-sm">
                  {course?.name ?? (loadError ? 'Couldn’t load course' : 'Loading…')}
                </h2>
                {location && (
                  <p className="mt-0.5 inline-flex items-center gap-1 text-body-sm text-white/85">
                    <IconMapPin size={13} aria-hidden /> {location}
                  </p>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="space-y-6 p-5">
              {/* Detail-fetch failure: explicit error + retry (the drawer must never
                  hang on a permanent "Loading…" hero when getCourseDetail rejects). */}
              {loadError && !loading ? (
                <InlineNotice
                  tone="danger"
                  title="Couldn’t load this course"
                  action={
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { if (courseId) loadDetail(courseId); }}
                    >
                      Try again
                    </Button>
                  }
                >
                  Something went wrong fetching the course details.
                </InlineNotice>
              ) : (
              <>
              {/* actions */}
              <div className="flex flex-wrap gap-2">
                {canManageTeam && course && (
                  <Button
                    variant={isSaved ? 'secondary' : 'primary'}
                    size="sm"
                    onClick={handleToggleSave}
                    busy={pending && !pinPending && defaultTeePending === null}
                  >
                    {isSaved ? <><IconCheck size={14} aria-hidden /> Saved</> : <><IconStar size={14} aria-hidden /> Save to team</>}
                  </Button>
                )}
                {canManageTeam && course && isSaved && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleTogglePin}
                    busy={pinPending}
                    aria-pressed={pinned}
                  >
                    <IconStar
                      size={14}
                      aria-hidden
                      className={pinned ? 'text-primary-600' : undefined}
                    />
                    {pinned ? 'Pinned' : 'Pin to top'}
                  </Button>
                )}
                {course && (
                  <Button variant="ghost" size="sm" onClick={() => setEditCourseOpen(true)}>
                    <IconPencil size={14} aria-hidden /> Edit course
                  </Button>
                )}
                {canManageTeam && course && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setDeleteCourseConfirm(true)}
                    className="ml-auto"
                  >
                    <IconTrash size={14} aria-hidden /> Remove course
                  </Button>
                )}
              </div>

              {/* website / address */}
              {(course?.website || course?.address) && (
                <div className="space-y-1 text-body-sm text-text-secondary">
                  {course?.address && <p>{course.address}</p>}
                  {course?.website && (
                    <a
                      href={course.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 underline-offset-2 hover:underline"
                    >
                      {course.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </div>
              )}

              {/* Tees */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-fw-sans text-body font-semibold text-text-primary">
                    Tee sets {tees.length > 0 && <span className="text-text-tertiary">· {tees.length}</span>}
                  </h3>
                  {course && (
                    <Button variant="ghost" size="sm" onClick={() => setTeeForm({ open: true, mode: 'create' })}>
                      <IconPlus size={14} aria-hidden /> Add tee
                    </Button>
                  )}
                </div>

                {loading ? (
                  <div className="space-y-2" role="status" aria-busy="true" aria-live="polite">
                    <span className="sr-only">Loading tee sets…</span>
                    {[0, 1].map((i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-fw-md" />
                    ))}
                  </div>
                ) : tees.length === 0 ? (
                  <p className="rounded-fw-md border border-dashed border-border-subtle bg-surface px-4 py-6 text-center text-body-sm text-text-tertiary">
                    No tee sets yet. Add one to capture pars and yardages.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {tees.map((tee) => (
                      <li key={tee.id}>
                        <TeeRow
                          tee={tee}
                          onEdit={() => handleEditTee(tee.id)}
                          canManageTeam={canManageTeam && isSaved}
                          canDelete={canManageTeam}
                          isDefault={defaultTeeId === tee.id}
                          settingDefault={defaultTeePending === tee.id}
                          onSetDefault={() => handleSetDefaultTee(tee.id)}
                          onDelete={() => setDeleteTee({ id: tee.id, name: tee.tee_name })}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {course?.last_edited_at && (
                <p className="text-caption text-text-tertiary">
                  Last edited {new Date(course.last_edited_at).toLocaleDateString()}
                </p>
              )}
              </>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Edit course */}
      {course && (
        <CourseFormDrawer
          open={editCourseOpen}
          onOpenChange={setEditCourseOpen}
          mode="edit"
          course={course}
          onSaved={() => { void afterMutation(); setEditCourseOpen(false); }}
        />
      )}

      {/* Create / edit tee */}
      {courseId && (
        <TeeFormDrawer
          open={teeForm.open}
          onOpenChange={(o) => setTeeForm((s) => ({ ...s, open: o }))}
          mode={teeForm.mode}
          courseId={courseId}
          tee={teeForm.tee}
          onSaved={() => { void afterMutation(); setTeeForm((s) => ({ ...s, open: false })); }}
        />
      )}

      {/* Destructive confirmations (Nielsen #5) */}
      <ConfirmDialog
        open={removePhotoConfirm}
        variant="danger"
        title="Remove photo?"
        message="This clears the course photo. You can re-upload one later."
        confirmLabel="Remove photo"
        isLoading={pending}
        onConfirm={handleRemoveImage}
        onCancel={() => setRemovePhotoConfirm(false)}
      />
      <ConfirmDialog
        open={deleteTee !== null}
        variant="danger"
        title="Delete tee set?"
        message={
          deleteTee
            ? `“${deleteTee.name}” will be removed from this course. Recorded rounds keep their own snapshots.`
            : ''
        }
        confirmLabel="Delete tee set"
        isLoading={deleting}
        onConfirm={handleDeleteTee}
        onCancel={() => { if (!deleting) setDeleteTee(null); }}
      />
      <ConfirmDialog
        open={deleteCourseConfirm}
        variant="danger"
        title="Remove course?"
        message={`${course?.name ?? 'This course'} will be removed from the library. Recorded rounds keep their own snapshots.`}
        confirmLabel="Remove course"
        isLoading={deleting}
        onConfirm={handleDeleteCourse}
        onCancel={() => { if (!deleting) setDeleteCourseConfirm(false); }}
      />
    </>
  );
}

function TeeRow({
  tee, onEdit, canManageTeam = false, canDelete = false, isDefault = false, settingDefault = false, onSetDefault, onDelete,
}: {
  tee: GolfCourseTee;
  onEdit: () => void;
  canManageTeam?: boolean;
  canDelete?: boolean;
  isDefault?: boolean;
  settingDefault?: boolean;
  onSetDefault?: () => void;
  onDelete?: () => void;
}) {
  const cat = tee.category ? CATEGORY_LABEL[tee.category] ?? tee.category : null;
  // Draft honesty: total_par/total_yards are summed only over the holes that
  // exist, so for a draft (incomplete) tee they are PARTIAL — never present them
  // as a complete-course par. Qualify the par/yards with "(partial)" so the small
  // number can't be misread as a full-course figure. The "Draft · partial of N
  // holes" label below names the target hole count for the full context.
  const partialSuffix = tee.is_draft ? ' (partial)' : '';
  const facts = [
    typeof tee.total_par === 'number' ? `Par ${tee.total_par}${partialSuffix}` : null,
    typeof tee.total_yards === 'number' ? `${tee.total_yards.toLocaleString()} yds${partialSuffix}` : null,
    typeof tee.course_rating === 'number' && typeof tee.slope_rating === 'number'
      ? `${tee.course_rating}/${tee.slope_rating}` : null,
  ].filter(Boolean);

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-fw-md border bg-surface px-4 py-3',
        isDefault ? 'border-primary-300 ring-1 ring-primary-200' : 'border-border-subtle',
      )}
    >
      <span
        aria-hidden
        className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600"
      >
        <IconFlag size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-fw-sans text-body font-medium text-text-primary">{tee.tee_name}</span>
          {cat && (
            <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-caption font-medium text-text-secondary">
              {cat}
            </span>
          )}
          {isDefault && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-caption font-medium text-primary-700">
              <IconCheck size={11} aria-hidden /> Team default
            </span>
          )}
          {tee.is_draft && (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-caption font-medium text-warning">
              Draft · partial of {tee.holes_count} holes
            </span>
          )}
        </div>
        {facts.length > 0 && (
          <p className="mt-0.5 truncate text-caption text-text-tertiary">{facts.join(' · ')}</p>
        )}
      </div>
      {canManageTeam && onSetDefault && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onSetDefault}
          busy={settingDefault}
          aria-pressed={isDefault}
          aria-label={isDefault ? `Clear ${tee.tee_name} as team default tee` : `Set ${tee.tee_name} as team default tee`}
        >
          {isDefault ? 'Default' : 'Set default'}
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${tee.tee_name}`}>
        <IconPencil size={14} aria-hidden /> Edit
      </Button>
      {canDelete && onDelete && (
        <Button
          variant="danger"
          size="sm"
          onClick={onDelete}
          aria-label={`Delete ${tee.tee_name} tee set`}
        >
          <IconTrash size={14} aria-hidden />
        </Button>
      )}
    </div>
  );
}
