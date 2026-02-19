"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { deleteReceptionist } from "@/app/actions/deleteReceptionist";

type Props = {
  receptionistId: string;
  receptionistName: string;
  variant?: "default" | "outline" | "ghost" | "destructive" | "link" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  /** When true, shows icon-only button (for list view) */
  iconOnly?: boolean;
};

export function DeleteReceptionistButton({
  receptionistId,
  receptionistName,
  variant = "destructive",
  size = "sm",
  className,
  iconOnly = false,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) setOpen(false);
    };
    document.addEventListener("keydown", onEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.body.style.overflow = "";
    };
  }, [open, loading]);

  async function handleConfirmDelete() {
    setLoading(true);
    const result = await deleteReceptionist(receptionistId);
    setLoading(false);
    if (result.success) {
      setOpen(false);
      router.push("/receptionists");
      router.refresh();
    } else {
      alert(result.error);
    }
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
        disabled={loading}
        type="button"
      >
        {iconOnly ? (
          <Trash2 className="h-4 w-4" aria-label={`Delete ${receptionistName}`} />
        ) : (
          <>
            <Trash2 className="mr-1.5 h-4 w-4" />
            Delete
          </>
        )}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          aria-describedby="delete-dialog-description"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => !loading && setOpen(false)}
            aria-hidden="true"
          />
          {/* Dialog */}
          <div className="relative z-10 mx-4 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
            <h2 id="delete-dialog-title" className="text-lg font-semibold">
              Delete &quot;{receptionistName}&quot;?
            </h2>
            <p
              id="delete-dialog-description"
              className="mt-2 text-sm text-muted-foreground"
            >
              This will remove the receptionist, its Vapi assistant, and phone
              number. Call history and settings will be lost. This cannot be
              undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => !loading && setOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDelete}
                disabled={loading}
              >
                {loading ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
