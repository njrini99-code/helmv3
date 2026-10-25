'use client';

import { acknowledgeAnnouncement } from '@/app/golf/actions/communication';
import { createEnrichedAnnouncement, deleteAnnouncement, getAnnouncementDetail, updateAnnouncement } from '@/app/golf/actions/announcements';
import { markTravelSeen } from '@/app/golf/actions/player-notifications';
import { markNotificationRead } from '@/app/golf/actions/unified-notifications';
import { createGolfDocument, deleteGolfDocument, getPreviewUrl, prepareGolfDocumentUpload } from '@/app/golf/actions/documents';
import { respondToEvent, updateGolfEvent } from '@/app/golf/actions/calendar-events';
import { completeTask, createTask, deleteTask, uncompleteTask } from '@/app/golf/actions/tasks';
import { createGolfTravelItinerary, deleteGolfTravelItinerary, getTravelerClassConflicts, updateGolfTravelItinerary } from '@/app/golf/actions/travel';
import type { ChHubUrgency } from '../../data/hub';
import type { ChTravelerClass, ChTripWindow } from '../../data/hub-shape';
import { putWithProgress } from '../recruiting/upload';
import { uploadTeamDocument } from './upload';
import type { ServerResult } from '../../lib/use-action';

/**
 * Every Team Hub write, as the page calls it. The live set wraps the actions
 * the separate coach pages and the player hub already use (one write path per
 * behaviour; docs/clubhouse/phone/team-hub.md). Preview and tests pass their
 * own set, so nothing there reaches the server.
 */
export interface ChHubWrites {
  reply(eventId: string, status: 'accepted' | 'tentative' | 'declined'): Promise<ServerResult>;
  acknowledge(announcementId: string): Promise<ServerResult>;
  completeTask(taskId: string): Promise<ServerResult>;
  /** Undo the player's own tick (an accidental one): the task is open again. */
  uncompleteTask(taskId: string): Promise<ServerResult>;
  openDocument(documentId: string): Promise<ServerResult<{ url: string }>>;
  /**
   * `data.attachmentsError` is set when the post exists but its files did not attach (Q-82): the post is not replayed to
   * fix it, so the sheet closes and says so once.
   */
  postAnnouncement(input: { title: string; body: string; requiresAck: boolean; playerIds: string[] | null; documentIds: string[] }): Promise<ServerResult<{ announcementId: string; attachmentsError?: string }>>;
  /** A posted announcement's headline, message and acknowledgement (updateAnnouncement takes no audience or attachments). */
  editAnnouncement(id: string, input: { title: string; body: string; urgency: ChHubUrgency; requiresAck: boolean }): Promise<ServerResult>;
  deleteAnnouncement(id: string): Promise<ServerResult>;
  assignTask(input: { teamId: string; title: string; detail: string; dueDate: string | null; playerIds: string[] }): Promise<ServerResult>;
  deleteTask(id: string): Promise<ServerResult>;
  /** Saves the itinerary; `data.id` is the new trip's, so a retry of the travelers step never saves it twice. */
  planTrip(input: ChTripInput): Promise<ServerResult<{ id: string }>>;
  /** Who travels: the linked event's invitees (updateGolfEvent adds and removes explicitly; it never widens to the team). */
  setTravelers(eventId: string, change: { add: string[]; remove: string[] }): Promise<ServerResult>;
  /**
   * A read, not a write: which of the chosen travelers have a class inside the trip's dates (Q-84). Only those players'
   * classes that overlap the window come back. `partial` means a read behind the answer failed, so it is not an all-clear.
   */
  travelerClasses(input: ChTripWindow & { teamId: string; playerIds: string[] }): Promise<ServerResult<{ classes: ChTravelerClass[]; partial: boolean }>>;
  uploadDocument(input: { teamId: string; file: File; folder: string | null }): Promise<ServerResult>;
  deleteDocument(id: string): Promise<ServerResult>;
  /** Saves what Edit shows: the trip's fields and its dates and times, a blank clearing one. */
  editTrip(input: ChTripEdit): Promise<ServerResult>;
  /** Deletes the itinerary (its expenses and budgets go with it; the calendar event stays). */
  deleteTrip(id: string): Promise<ServerResult>;
  /**
   * A read: the files attached to a post (getAnnouncementDetail, which holds a targeted post to its recipients), opened
   * with `openDocument` as production's announcement card opens them. Optional so preview sets can leave it out.
   */
  announcementFiles?(announcementId: string): Promise<ServerResult<{ files: Array<{ id: string; title: string; type: string | null }> }>>;
  /** A player's Travel tab clears the travel part of Team Hub's badge, as production's Travel page does on a visit. */
  markTravelSeen?(): Promise<ServerResult>;
  /** Opening an update marks that notification read, as the bell does. */
  markUpdateRead?(id: string, source: 'notifications' | 'golf_calendar_notifications'): Promise<ServerResult>;
}

/** What Edit sends: every field the sheet shows, as typed. A blank string clears the field. */
export interface ChTripEdit {
  id: string;
  name: string;
  destination: string;
  /** `null` when the trip has none and the coach hasn't picked one: the trip's own is then left as it is. */
  transport: ChTripInput['transport'] | null;
  departDate: string;
  departTime: string;
  from: string;
  returnDate: string;
  returnTime: string;
  hotel: string;
  notes: string;
}

export interface ChTripInput {
  teamId: string;
  /** The calendar event the trip is for (the builder's Event step); its invitees are the travelers. */
  eventId: string | null;
  name: string;
  destination: string;
  transport: 'bus' | 'van' | 'flight' | 'carpool';
  departDate: string;
  departTime: string;
  from: string;
  returnDate: string;
  returnTime: string;
  hotel: string;
  notes: string;
}

const blank = (s: string) => (s.trim() === '' ? undefined : s.trim());

export const LIVE_HUB_WRITES: ChHubWrites = {
  reply: (eventId, status) => respondToEvent(eventId, status) as Promise<ServerResult>,
  acknowledge: (id) => acknowledgeAnnouncement(id),
  completeTask: (id) => completeTask(id),
  uncompleteTask: (id) => uncompleteTask(id),
  async openDocument(id) {
    const res = await getPreviewUrl(id);
    if (res.error || !res.data) return { success: false, error: res.noContent ? 'This file has no stored copy to open.' : (res.error ?? undefined) };
    return { success: true, data: { url: res.data.url } };
  },
  postAnnouncement: (i) =>
    createEnrichedAnnouncement({ title: i.title.trim(), body: i.body.trim(), urgency: 'normal', requiresAcknowledgement: i.requiresAck, recipientPlayerIds: i.playerIds, documentIds: i.documentIds, inlineTasks: [] }),
  editAnnouncement: (id, i) => updateAnnouncement(id, { title: i.title.trim(), body: i.body.trim(), urgency: i.urgency, requiresAcknowledgement: i.requiresAck }),
  deleteAnnouncement: (id) => deleteAnnouncement(id),
  assignTask: (i) => createTask(i.teamId, i.title.trim(), blank(i.detail), i.dueDate ?? undefined, undefined, i.playerIds),
  deleteTask: (id) => deleteTask(id),
  planTrip: (i) =>
    createGolfTravelItinerary({
      team_id: i.teamId,
      event_id: i.eventId ?? undefined,
      event_name: i.name.trim(),
      destination: i.destination.trim(),
      transportation_type: i.transport,
      departure_date: i.departDate,
      departure_time: blank(i.departTime),
      departure_location: blank(i.from),
      return_date: blank(i.returnDate),
      return_time: blank(i.returnTime),
      hotel_name: blank(i.hotel),
      notes: blank(i.notes),
    }) as Promise<ServerResult<{ id: string }>>,
  setTravelers: (eventId, c) => updateGolfEvent(eventId, { addAttendeeIds: c.add, removeAttendeeIds: c.remove }) as Promise<ServerResult>,
  travelerClasses: (i) => getTravelerClassConflicts(i),
  // UP-1: the file goes straight to Storage on a signed URL, never through a server action's body (hub/upload.ts).
  uploadDocument: (i) => uploadTeamDocument({ prepare: prepareGolfDocumentUpload, put: (url, file, type) => putWithProgress(url, file, type), create: createGolfDocument }, i),
  deleteDocument: (id) => deleteGolfDocument(id),
  editTrip: (i) =>
    updateGolfTravelItinerary({
      id: i.id,
      event_name: i.name.trim(),
      destination: i.destination.trim(),
      ...(i.transport && { transportation_type: i.transport }),
      departure_date: i.departDate,
      departure_time: i.departTime,
      departure_location: i.from.trim(),
      return_date: i.returnDate,
      return_time: i.returnTime,
      hotel_name: i.hotel.trim(),
      notes: i.notes.trim(),
    }) as Promise<ServerResult>,
  deleteTrip: (id) => deleteGolfTravelItinerary(id),
  async announcementFiles(id) {
    const res = await getAnnouncementDetail(id);
    if (!res.success || !res.data) return { success: false, error: res.error };
    const files = [...(res.data.documents ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((d) => ({ id: d.document_id, title: d.document?.title?.trim() || 'Attachment', type: d.document?.file_type ?? null }));
    return { success: true, data: { files } };
  },
  markTravelSeen: () => markTravelSeen(),
  markUpdateRead: (id, source) => markNotificationRead(id, source),
};
