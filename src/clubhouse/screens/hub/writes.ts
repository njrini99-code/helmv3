'use client';

import { acknowledgeAnnouncement } from '@/app/golf/actions/communication';
import { createEnrichedAnnouncement, deleteAnnouncement, updateAnnouncement } from '@/app/golf/actions/announcements';
import { createGolfDocument, deleteGolfDocument, getPreviewUrl, uploadGolfDocument } from '@/app/golf/actions/documents';
import { respondToEvent } from '@/app/golf/actions/golf';
import { completeTask, createTask, deleteTask, uncompleteTask } from '@/app/golf/actions/tasks';
import { createGolfTravelItinerary } from '@/app/golf/actions/travel';
import type { ChHubUrgency } from '../../data/hub';
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
  postAnnouncement(input: { title: string; body: string; requiresAck: boolean; playerIds: string[] | null; documentIds: string[] }): Promise<ServerResult<{ announcementId: string }>>;
  /** A posted announcement's headline, message and acknowledgement (updateAnnouncement takes no audience or attachments). */
  editAnnouncement(id: string, input: { title: string; body: string; urgency: ChHubUrgency; requiresAck: boolean }): Promise<ServerResult>;
  deleteAnnouncement(id: string): Promise<ServerResult>;
  assignTask(input: { teamId: string; title: string; detail: string; dueDate: string | null; playerIds: string[] }): Promise<ServerResult>;
  deleteTask(id: string): Promise<ServerResult>;
  planTrip(input: ChTripInput): Promise<ServerResult>;
  uploadDocument(input: { teamId: string; file: File; folder: string | null }): Promise<ServerResult>;
  deleteDocument(id: string): Promise<ServerResult>;
}

export interface ChTripInput {
  teamId: string;
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
    }) as Promise<ServerResult>,
  async uploadDocument(i) {
    const up = await uploadGolfDocument(i.file, i.teamId);
    if (!up.success || !up.file_url) return { success: false, error: up.error };
    const ext = i.file.name.split('.').pop()?.toLowerCase() ?? '';
    return createGolfDocument({
      team_id: i.teamId,
      title: i.file.name.replace(/\.[^.]+$/, ''),
      file_url: up.file_url,
      file_type: ext,
      file_size: i.file.size,
      player_visible: true,
      folder: i.folder ?? undefined,
      storage_path: up.storage_path,
    });
  },
  deleteDocument: (id) => deleteGolfDocument(id),
};
