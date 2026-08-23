import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext, AuthError, authErrorResponse } from "@/lib/auth";
import { getGmailClient } from "@/lib/google-client";

export async function POST(req: NextRequest) {
  try {
    const { organizationId } = await requireOrgContext(req);
    
    const body = await req.json().catch(() => ({}));
    const { rules, googleConnectionId } = body;
    
    if (!googleConnectionId) {
      return NextResponse.json({ error: "Missing googleConnectionId" }, { status: 400 });
    }
    if (!rules || !Array.isArray(rules)) {
      return NextResponse.json({ error: "Missing rules array" }, { status: 400 });
    }

    const queryParts: string[] = [];
    for (const rule of rules) {
      let value: unknown;
      try { value = JSON.parse(rule.value); } catch { value = rule.value; }
      
      switch (rule.filterType) {
        case "sender":
          queryParts.push(`from:${Array.isArray(value) ? value.join(" OR from:") : value}`);
          break;
        case "subject":
          queryParts.push(rule.operator === "contains" ? `subject:${value}` : `-subject:${value}`);
          break;
        case "date": {
          if (rule.operator === "gt") queryParts.push(`after:${value}`);
          if (rule.operator === "lt") queryParts.push(`before:${value}`);
          if (rule.operator === "between") {
            let metadata;
            try { metadata = rule.metadata ? (typeof rule.metadata === 'string' ? JSON.parse(rule.metadata) : rule.metadata) : null; } catch { /* ignore */ }
            if (metadata?.startDate && metadata?.endDate) {
              queryParts.push(`after:${metadata.startDate} before:${metadata.endDate}`);
            }
          }
          break;
        }
        case "attachment": {
          if (value === true || value === "true" || value === "required") {
            queryParts.push("has:attachment");
            let metadata;
            try { metadata = rule.metadata ? (typeof rule.metadata === 'string' ? JSON.parse(rule.metadata) : rule.metadata) : null; } catch { /* ignore */ }
            if (metadata?.allowedExtensions) {
              const exts = (metadata.allowedExtensions as string)
                .split(",")
                .map(e => e.trim().replace(/^\./, ""))
                .filter(Boolean);
              if (exts.length > 0) {
                const filenameQuery = exts.map(e => `filename:${e}`).join(" OR ");
                queryParts.push(`(${filenameQuery})`);
              }
            }
          }
          break;
        }
        case "drive_link":
          if (value === true || value === "true" || value === "required") queryParts.push("drive.google.com");
          break;
      }
    }
    const operatorStr = body.ruleOperator === "OR" ? " OR " : " ";
    const gmailQuery = queryParts.length > 0 ? queryParts.join(operatorStr) : "";

    const gmail = await getGmailClient(googleConnectionId);
    
    // Fetch matching message IDs from Gmail (max 5)
    const listResp = await gmail.users.messages.list({
      userId: "me",
      q: gmailQuery || undefined,
      maxResults: 5,
    });
    
    const messageRefs = listResp.data.messages ?? [];
    
    // Fetch headers to show preview
    const previews = await Promise.all(messageRefs.map(async (msgRef) => {
      const msg = await gmail.users.messages.get({
        userId: "me",
        id: msgRef.id!,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "Date"]
      });
      
      const headers = msg.data.payload?.headers || [];
      const subject = headers.find(h => h.name?.toLowerCase() === "subject")?.value || "(No Subject)";
      const from = headers.find(h => h.name?.toLowerCase() === "from")?.value || "(Unknown Sender)";
      const date = headers.find(h => h.name?.toLowerCase() === "date")?.value || "";
      
      return {
        id: msgRef.id,
        subject,
        from,
        date,
        snippet: msg.data.snippet
      };
    }));

    return NextResponse.json({ 
      query: gmailQuery,
      count: listResp.data.resultSizeEstimate || previews.length,
      previews 
    }, { status: 200 });

  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to simulate scan" },
      { status: 500 }
    );
  }
}
