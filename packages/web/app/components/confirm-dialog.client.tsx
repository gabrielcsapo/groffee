"use client";

import { useState } from "react";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="bg-surface border border-border rounded-lg p-6 max-w-sm w-full mx-4 shadow-lg animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-text-primary mb-2">{title}</h3>
        <p className="text-sm text-text-secondary mb-4">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button onClick={onConfirm} className="btn-danger">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirmDialog() {
  const [state, setState] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    resolve: ((value: boolean) => void) | null;
  }>({ open: false, title: "", message: "", confirmLabel: "Delete", resolve: null });

  function confirm(opts: {
    title: string;
    message: string;
    confirmLabel?: string;
  }): Promise<boolean> {
    return new Promise((resolve) => {
      setState({
        open: true,
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel || "Delete",
        resolve,
      });
    });
  }

  function handleConfirm() {
    state.resolve?.(true);
    setState((s) => ({ ...s, open: false, resolve: null }));
  }

  function handleCancel() {
    state.resolve?.(false);
    setState((s) => ({ ...s, open: false, resolve: null }));
  }

  const dialog = state.open ? (
    <ConfirmDialog
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return { confirm, dialog };
}
