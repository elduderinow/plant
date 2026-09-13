"use client";

import { useEffect, useRef, useState } from "react";

export const MAX_MESSAGE = 280;
export const MAX_NAME = 40;

const NAME_KEY = "plant.name";

/**
 * Opens over the leaf that was just placed. Clicking away cancels, which also
 * removes the leaf, so nothing is written until someone means it.
 */
export default function LeafComposer({
  onConfirm,
  onCancel,
  busy,
  error,
}: {
  onConfirm: (author: string, message: string) => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const [author, setAuthor] = useState("");
  const [message, setMessage] = useState("");
  const messageRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(NAME_KEY);
    if (saved) setAuthor(saved);
    messageRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const trimmedName = author.trim();
  const trimmedMessage = message.trim();
  const ready = trimmedName.length > 0 && trimmedMessage.length > 0;

  const submit = () => {
    if (!ready || busy) return;
    window.localStorage.setItem(NAME_KEY, trimmedName);
    onConfirm(trimmedName, trimmedMessage);
  };

  return (
    <div className="overlay" onPointerDown={onCancel}>
      <form
        className="composer"
        onPointerDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label>
          <span>your name</span>
          <input
            value={author}
            maxLength={MAX_NAME}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="required"
          />
        </label>

        <label>
          <span>your message</span>
          <textarea
            ref={messageRef}
            value={message}
            maxLength={MAX_MESSAGE}
            rows={3}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
          />
        </label>

        <div className="composer-foot">
          <span className="muted">
            {MAX_MESSAGE - message.length} left
          </span>
          <div className="composer-actions">
            <button type="button" onClick={onCancel}>
              cancel
            </button>
            <button type="submit" disabled={!ready || busy}>
              {busy ? "leaving…" : "leave it"}
            </button>
          </div>
        </div>

        {error ? <p className="error">{error}</p> : null}
      </form>
    </div>
  );
}
