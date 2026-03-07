"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { fetchAndSaveWebsiteContent } from "@/app/actions/websiteContent";
import type { SettingsMessage } from "./types";

type Props = {
  receptionistId: string;
  websiteUrl: string;
  setWebsiteUrl: (v: string) => void;
  websiteContentUpdatedAt: string | null;
  setWebsiteContentUpdatedAt: (v: string | null) => void;
  onMessage: (m: SettingsMessage) => void;
  onRefresh: () => void;
};

export function WebsiteCard({
  receptionistId,
  websiteUrl,
  setWebsiteUrl,
  websiteContentUpdatedAt,
  setWebsiteContentUpdatedAt,
  onMessage,
  onRefresh,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleFetch() {
    if (!websiteUrl?.trim()) {
      onMessage({ type: "error", text: "Please enter a website URL." });
      return;
    }
    setLoading(true);
    onMessage(null);
    const res = await fetchAndSaveWebsiteContent(receptionistId, websiteUrl.trim());
    setLoading(false);
    if ("error" in res) {
      onMessage({ type: "error", text: res.error });
      return;
    }
    setWebsiteContentUpdatedAt(new Date().toISOString());
    onMessage({ type: "success", text: "Website content saved. Save to assistant to apply." });
    onRefresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business website</CardTitle>
        <CardDescription>
          Add your website URL to pull in information your assistant can use when answering calls.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input
            type="url"
            placeholder="https://yoursite.com"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            className="max-w-md"
          />
          <Button type="button" onClick={handleFetch} disabled={loading}>
            {loading ? "Fetching…" : "Fetch from website"}
          </Button>
        </div>
        {websiteContentUpdatedAt && (
          <p className="text-sm text-muted-foreground">
            Last fetched: {new Date(websiteContentUpdatedAt).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
