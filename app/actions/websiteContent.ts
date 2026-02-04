"use server";

import { createClient } from "@/app/lib/supabase/server";
import { assertReceptionistOwnership } from "@/app/actions/receptionistOwnership";

const FETCH_TIMEOUT_MS = 10000;
const MAX_CONTENT_CHARS = 15000;

function stripHtmlToText(html: string): string {
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > MAX_CONTENT_CHARS) {
    text = text.slice(0, MAX_CONTENT_CHARS) + "\n\n[Content truncated for length.]";
  }
  return text;
}

export async function fetchAndSaveWebsiteContent(
  receptionistId: string,
  url: string
): Promise<{ ok: true } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };

  const trimmed = url?.trim();
  if (!trimmed) return { error: "Please enter a website URL." };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: "Invalid URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "URL must be http or https." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(trimmed, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AIReceptionist/1.0; +https://example.com)",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) {
      return { error: `Could not fetch: ${res.status} ${res.statusText}` };
    }
    const html = await res.text();
    const content = stripHtmlToText(html);
    if (!content) {
      return { error: "No text content could be extracted from the page." };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("receptionists")
      .update({
        website_url: trimmed,
        website_content: content,
        website_content_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", receptionistId);

    if (error) return { error: error.message };
    return { ok: true };
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error) {
      if (err.name === "AbortError") return { error: "Request timed out." };
      return { error: err.message };
    }
    return { error: "Could not fetch website." };
  }
}
