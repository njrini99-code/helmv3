"use client";

import { useEffect, useState } from "react";
import { haptic } from "../../lib/haptics";
import { useToast } from "../../ui/Toast";
import { dayLabel, type ChConv, type ChFile } from "./model";
import { fileSize, type ChMessagesApi } from "./MessagesView";

/**
 * A conversation's shared files (D-48), read once per open conversation and
 * again on Try again. Phone and desktop Details draw their own rows from it:
 * loading (CH-7409), didn't load (CH-7214), none yet (CH-7306). `open` signs
 * the file through its message's attachments and opens it; a failure says so
 * (CH-7021).
 */
export function useConversationFiles(api: ChMessagesApi, conv: ChConv) {
  const toast = useToast();
  const [files, setFiles] = useState<ChFile[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const load = api.files;
  useEffect(() => {
    let live = true;
    setFailed(false);
    setFiles(null);
    load(conv.id)
      .then((r) => live && (r ? setFiles(r) : setFailed(true)))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [load, conv.id, attempt]);
  const open = async (f: ChFile) => {
    const list = await api.attachments(f.messageId).catch(() => null);
    const hit = list?.find((x) => x.id === f.id) ?? null;
    if (!hit?.url) {
      haptic("error");
      toast({ tone: "error", title: `Couldn't open ${f.name}`, body: "Try again in a moment.", code: "CH-7021" });
      return;
    }
    window.open(hit.url, "_blank", "noopener,noreferrer");
  };
  return { files, failed, retry: () => setAttempt((n) => n + 1), open };
}

const kindOf = (mime: string) =>
  mime === "application/pdf" ? "PDF" : mime.startsWith("image/") ? "Image" : mime.startsWith("video/") ? "Video" : mime.startsWith("audio/") ? "Audio" : "File";

/** "PDF · 48 KB · Today", the second line of a file row. */
export const fileMeta = (f: ChFile, api: ChMessagesApi) =>
  [kindOf(f.mime), fileSize(f.size), f.sentAt ? dayLabel(f.sentAt, api.now, api.timeZone) : null].filter(Boolean).join(" · ");
