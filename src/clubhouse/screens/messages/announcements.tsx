'use client';

import { Check, ChevronLeft, CircleCheck, FileText, Megaphone, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar } from '../../ui/Avatar';
import { Badge } from '../../ui/Badge';
import { Button, IconButton } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { Skeleton } from '../../ui/States';
import { haptic } from '../../lib/haptics';
import { chTrail } from '../../lib/track';
import { clock, dayLabel, needsMyAck, railTime, type ChAnnouncement, type ChAnnouncementDetail } from './model';
import type { ChMessagesApi } from './MessagesView';

/** Pinned above conversations: the team's announcements, newest first. */
export function AnnouncementsSection({ api, q }: { api: ChMessagesApi; q: string }) {
  const s = q.trim().toLowerCase();
  const list = api.announcements.filter((a) => !s || a.title.toLowerCase().includes(s) || a.body.toLowerCase().includes(s)).slice(0, s ? 20 : 3);
  if (api.annError) {
    return (
      <section className="ch-ms-sec" aria-label="Announcements">
        <div className="ch-ms-sec__l">Announcements</div>
        <InlineNotice code="CH-7206" title="Announcements didn't load." body="Try again; the error has been reported." onRetry={api.refetchAnns} />
      </section>
    );
  }
  if (!list.length) return null;
  const more = s ? 0 : api.announcements.length - list.length;
  return (
    <section className="ch-ms-sec" aria-label="Announcements">
      <div className="ch-ms-sec__l">Announcements</div>
      <div className="ch-ms-sec__card">
        {list.map((a) => {
          const mine = needsMyAck(a, api.viewer.role);
          return (
            <button
              key={a.id}
              type="button"
              className={'ch-ms-row is-ann' + (mine ? ' is-unread' : '') + (api.selectedAnnId === a.id ? ' is-sel' : '')}
              aria-current={api.selectedAnnId === a.id ? 'true' : undefined}
              onClick={() => {
                haptic('select');
                chTrail('messages open announcement');
                api.selectAnn(a.id);
              }}
            >
              <span className={'ch-ms-grp is-ann' + (a.urgent ? ' is-urgent' : '')}>
                <Icon icon={Megaphone} size={15} />
              </span>
              <span className="ch-ms-row__main">
                <span className="ch-ms-row__top">
                  <b>{a.title}</b>
                  <span className="ch-num">{railTime(a.publishedAt, api.now, api.timeZone)}</span>
                </span>
                <span className="ch-ms-row__bot">
                  <span>
                    {api.viewer.role === 'coach' && a.requiresAck ? <em>{`${a.ackCount} of ${a.total} acknowledged · `}</em> : mine ? <em>Needs your acknowledgement · </em> : null}
                    {a.body}
                  </span>
                  {mine && <span className="ch-ms-count" aria-label="Needs your acknowledgement">1</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {more > 0 && (
        <button type="button" className="ch-ms-more" onClick={() => api.selectAnn(api.announcements[list.length]!.id)}>
          {more} earlier {more === 1 ? 'announcement' : 'announcements'}
        </button>
      )}
    </section>
  );
}

export function AnnouncementPane({ api, a, onBack }: { api: ChMessagesApi; a: ChAnnouncement; onBack: () => void }) {
  const [detail, setDetail] = useState<ChAnnouncementDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const load = api.announcementDetail;
  useEffect(() => {
    let live = true;
    setFailed(false);
    load(a.id)
      .then((d) => live && (d ? setDetail(d) : setFailed(true)))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [load, a.id, attempt, a.ackCount, a.completedTaskCount]);
  const coach = api.viewer.role === 'coach';
  const mine = needsMyAck(a, api.viewer.role);
  const published = a.publishedAt ? `${dayLabel(a.publishedAt, api.now, api.timeZone)} · ${clock(a.publishedAt, api.timeZone)}` : 'Scheduled';

  return (
    <section className="ch-ms-thread" aria-label={`Announcement: ${a.title}`}>
      <header className="ch-ms-th">
        <div className="ch-ms-th__who">
          <span className="ch-ms-back">
            <IconButton icon={ChevronLeft} label="All conversations" onClick={onBack} />
          </span>
          <span className={'ch-ms-grp is-lg is-ann' + (a.urgent ? ' is-urgent' : '')}>
            <Icon icon={Megaphone} size={17} />
          </span>
          <div style={{ minWidth: 0 }}>
            <b>Announcement</b>
            <span>
              {api.teamName ?? 'Team'} · {published}
            </span>
          </div>
        </div>
      </header>
      <div className="ch-ms-scroll">
        <article className="ch-ms-ann">
          <div className="ch-ms-ann__kick">
            {a.urgent && (
              <Badge tone="warning">
                <Icon icon={TriangleAlert} size={11} />
                Urgent
              </Badge>
            )}
            {a.requiresAck && <Badge tone="neutral">Acknowledgement requested</Badge>}
          </div>
          <h2 className="ch-ms-ann__title">{a.title}</h2>
          {a.body && <p className="ch-ms-ann__body">{a.body}</p>}

          {mine && (
            <div className="ch-ms-ann__ack">
              <span>Coach asked everyone to confirm they&apos;ve read this.</span>
              <Button
                variant="primary"
                leftIcon={Check}
                disabled={busy === 'ack'}
                onClick={async () => {
                  setBusy('ack');
                  await api.acknowledge(a.id);
                  setBusy(null);
                }}
              >
                {busy === 'ack' ? 'Sending…' : 'Acknowledge'}
              </Button>
            </div>
          )}
          {!coach && a.requiresAck && a.acknowledgedByMe && (
            <p className="ch-ms-ann__done">
              <Icon icon={CircleCheck} size={15} />
              You acknowledged this.
            </p>
          )}

          {failed ? (
            <InlineNotice code="CH-7207" title="The details didn't load." body="The announcement above is complete. Try again for replies, tasks and files." onRetry={() => setAttempt((x) => x + 1)} />
          ) : !detail ? (
            (a.requiresAck || a.taskCount > 0 || a.docCount > 0) && (
              <div style={{ display: 'grid', gap: 10 }} aria-busy="true" data-ch-code="CH-7406">
                <Skeleton height={16} width={180} />
                <Skeleton height={44} />
              </div>
            )
          ) : (
            <>
              {detail.tasks.length > 0 && (
                <div className="ch-ms-ann__sec">
                  <div className="ch-ms-det__l">
                    <span>Tasks</span>
                  </div>
                  {detail.tasks.map((t) => (
                    <div key={t.taskId} className="ch-ms-ann__task">
                      <span style={{ minWidth: 0 }}>
                        <b>{t.title}</b>
                        <span>
                          {t.due ? `Due ${t.due}` : 'No due date'}
                          {coach ? ` · ${t.done} of ${t.total} done` : ''}
                        </span>
                      </span>
                      {!coach &&
                        (t.doneByMe ? (
                          <Badge tone="positive" dot>
                            Done
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            disabled={busy === t.taskId}
                            onClick={async () => {
                              setBusy(t.taskId);
                              await api.completeTask(a.id, t.taskId);
                              setBusy(null);
                            }}
                          >
                            Mark done
                          </Button>
                        ))}
                    </div>
                  ))}
                </div>
              )}
              {detail.documents.length > 0 && (
                <div className="ch-ms-ann__sec">
                  <div className="ch-ms-det__l">
                    <span>Files</span>
                  </div>
                  {detail.documents.map((d) => (
                    <a key={d.id} className="ch-ms-bub ch-ms-bub--file" href={d.url} target="_blank" rel="noreferrer">
                      <span className="ch-ms-file__ic">
                        <Icon icon={FileText} size={16} />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <b>{d.title}</b>
                      </span>
                    </a>
                  ))}
                </div>
              )}
              {coach && a.requiresAck && (
                <div className="ch-ms-ann__sec">
                  <div className="ch-ms-det__l">
                    <span className="ch-num">
                      {detail.acknowledged.length} of {detail.acknowledged.length + detail.waiting.length} acknowledged
                    </span>
                  </div>
                  {detail.waiting.map((w) => (
                    <div key={w.playerId} className="ch-ms-mem">
                      <Avatar name={w.name} size={30} />
                      <span style={{ minWidth: 0 }}>
                        <b>{w.name}</b>
                        <span>Not yet</span>
                      </span>
                      <span />
                    </div>
                  ))}
                  {detail.acknowledged.map((x) => (
                    <div key={x.playerId} className="ch-ms-mem">
                      <Avatar name={x.name} size={30} />
                      <span style={{ minWidth: 0 }}>
                        <b>{x.name}</b>
                        <span className="ch-num">
                          {dayLabel(x.at, api.now, api.timeZone)} · {clock(x.at, api.timeZone)}
                        </span>
                      </span>
                      <Badge tone="positive" dot>
                        Read
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </article>
      </div>
    </section>
  );
}
