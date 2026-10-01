"use client";

import { useEffect } from "react";
import { useChPhone } from "../../lib/use-phone";
import { useToast } from "../../ui/Toast";
import { MessagesDesktop, type ChMessagesApi } from "./MessagesView";
import { MessagesPhone } from "./MessagesPhone";

// Its own module so MessagesView and MessagesPhone never import each other
// (check:cycles): the phone screen reuses MessagesView's parts, and only this
// file picks between the two.

/**
 * Messages, desktop or phone. Below 820px the owner's phone design renders
 * instead (MessagesPhone: an inbox that pushes a thread, details and a new
 * message), on the same container, hooks, actions and catalog.
 */
export function MessagesView({ api }: { api: ChMessagesApi }) {
  const phone = useChPhone();
  const conv = api.convs.find((c) => c.id === api.selectedId) ?? null;
  const toast = useToast();
  useEffect(() => {
    if (api.selectedId && !conv && !api.convsLoading && api.convs.length) {
      toast({
        tone: "error",
        title: "That conversation isn't available",
        body: "You may have left it, or it belongs to another team.",
        code: "CH-7015",
      });
      api.select(null);
    }
  }, [api.selectedId, api.convsLoading, api.convs.length, conv, toast]); // eslint-disable-line react-hooks/exhaustive-deps
  return phone ? <MessagesPhone api={api} /> : <MessagesDesktop api={api} />;
}
