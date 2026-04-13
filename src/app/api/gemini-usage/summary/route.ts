import { NextResponse } from "next/server";
import { createClient } from "~/utils/supabase/server";
import {
  estimateGeminiChatTurnUsd,
  formatUsd,
  GEMINI_PRICING_DOC_URL,
} from "~/lib/gemini-pricing";

export const dynamic = "force-dynamic";

interface UsageRow {
  id: string;
  created_at: string;
  model: string;
  prompt_tokens: number | null;
  candidates_tokens: number | null;
  total_tokens: number | null;
  user_id: string;
  project_id: string;
  thread_id: string;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const rawUserId = url.searchParams.get("userId");
  const trimmedUserId = rawUserId?.trim() ?? "";
  const userIdFilter = trimmedUserId !== "" ? trimmedUserId : user.id;

  const to = toParam ? new Date(toParam) : new Date();
  const from = fromParam
    ? new Date(fromParam)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "Invalid from or to date" }, { status: 400 });
  }

  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const { data: distinctData, error: distinctError } = await supabase
    .from("gemini_chat_usage")
    .select("user_id")
    .gte("created_at", fromIso)
    .lte("created_at", toIso);

  if (distinctError) {
    console.error("[gemini-usage/summary] distinct users:", distinctError);
    return NextResponse.json(
      { error: "Failed to load usage metadata" },
      { status: 500 },
    );
  }

  const userIds = new Set(
    (distinctData ?? []).map((r) => r.user_id as string),
  );
  userIds.add(user.id);
  const userIdsSorted = [...userIds].sort();

  const { data: rawRows, error: rowsError } = await supabase
    .from("gemini_chat_usage")
    .select(
      "id, created_at, model, prompt_tokens, candidates_tokens, total_tokens, user_id, project_id, thread_id",
    )
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .eq("user_id", userIdFilter)
    .order("created_at", { ascending: false });

  if (rowsError) {
    console.error("[gemini-usage/summary] rows:", rowsError);
    return NextResponse.json(
      { error: "Failed to load usage" },
      { status: 500 },
    );
  }

  const rows = (rawRows ?? []) as UsageRow[];

  let totalEstimatedUsd = 0;
  let unknownModelRows = 0;
  let totalPrompt = 0;
  let totalCandidates = 0;

  const items = rows.map((r) => {
    const estimatedUsd = estimateGeminiChatTurnUsd({
      model: r.model,
      promptTokens: r.prompt_tokens,
      candidatesTokens: r.candidates_tokens,
    });
    if (estimatedUsd == null) unknownModelRows += 1;
    else totalEstimatedUsd += estimatedUsd;
    totalPrompt += Number(r.prompt_tokens ?? 0);
    totalCandidates += Number(r.candidates_tokens ?? 0);

    return {
      id: r.id,
      createdAt: r.created_at,
      model: r.model,
      promptTokens: r.prompt_tokens,
      candidatesTokens: r.candidates_tokens,
      totalTokens: r.total_tokens,
      projectId: r.project_id,
      threadId: r.thread_id,
      estimatedUsd,
      estimatedUsdFormatted: formatUsd(estimatedUsd),
    };
  });

  const threadIds = [...new Set(rows.map((r) => r.thread_id))];
  const threadMeta: Record<
    string,
    { title: string | null; projectId: string }
  > = {};

  if (threadIds.length > 0) {
    const { data: threadRows, error: threadErr } = await supabase
      .from("chat_threads")
      .select("id, title, project_id")
      .in("id", threadIds);

    if (threadErr) {
      console.error("[gemini-usage/summary] threads:", threadErr);
    } else {
      for (const t of threadRows ?? []) {
        const row = t as {
          id: string;
          title: string | null;
          project_id: string;
        };
        threadMeta[row.id] = {
          title: row.title,
          projectId: row.project_id,
        };
      }
    }
  }

  return NextResponse.json({
    pricingNote: `Estimates use published Standard (paid) list prices. Tooling and grounding are excluded. ${GEMINI_PRICING_DOC_URL}`,
    range: { from: fromIso, to: toIso },
    filterUserId: userIdFilter,
    currentUserId: user.id,
    userOptions: userIdsSorted.map((id) => ({
      id,
      label: id === user.id ? "You" : `${id.slice(0, 8)}…`,
    })),
    summary: {
      rowCount: rows.length,
      totalPromptTokens: totalPrompt,
      totalCandidatesTokens: totalCandidates,
      totalEstimatedUsd,
      totalEstimatedUsdFormatted: formatUsd(totalEstimatedUsd),
      rowsWithUnknownModelPricing: unknownModelRows,
    },
    rows: items,
    threadMeta,
  });
}
