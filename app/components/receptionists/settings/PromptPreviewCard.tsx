"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { getPromptPreview } from "@/app/actions/applyReceptionistPrompt";
import type { SettingsMessage } from "./types";

type Props = {
  receptionistId: string;
  onMessage: (m: SettingsMessage) => void;
  onRefresh: () => void;
};

export function PromptPreviewCard({ receptionistId, onMessage, onRefresh }: Props) {
  const [preview, setPreview] = useState<string>("");
  const [charCount, setCharCount] = useState(0);
  const [compact, setCompact] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [showPreviewDetails, setShowPreviewDetails] = useState(false);

  async function loadPreview() {
    setLoadingPreview(true);
    onMessage(null);
    const res = await getPromptPreview(receptionistId, { compact });
    setLoadingPreview(false);
    if ("error" in res) {
      onMessage({ type: "error", text: res.error });
      return;
    }
    setPreview(res.prompt);
    setCharCount(res.charCount);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>What the assistant will know</CardTitle>
        <CardDescription>
          Update what your assistant knows from staff, services, locations, and more. For self-hosted voice, instructions are loaded automatically on each call.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={compact}
            onChange={(e) => setCompact(e.target.checked)}
          />
          <span className="text-sm">Compact mode (include fewer services/staff in instructions)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={loadPreview} disabled={loadingPreview}>
            {loadingPreview ? "Loading…" : "Preview"}
          </Button>
        </div>
        {preview && (
          <div className="space-y-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowPreviewDetails((v) => !v)}
            >
              {showPreviewDetails ? "Hide technical details" : "Show technical details"}
            </Button>
            {showPreviewDetails && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  ~{Math.ceil(charCount / 4)} tokens · {charCount} characters
                </p>
                <pre className="max-h-48 overflow-auto rounded border bg-muted/50 p-3 text-xs whitespace-pre-wrap">
                  {preview.slice(0, 2000)}
                  {preview.length > 2000 ? "\n\n… [truncated for display]" : ""}
                </pre>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
