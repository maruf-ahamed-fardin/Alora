import Anthropic from "@anthropic-ai/sdk";
import { createChatModel } from "../../../ai/anthropic";
import { handleCustomerMessage } from "../../../ai/engine";
import {
  AiNotConfiguredError,
  EmptyReplyError,
  ModelRefusedError,
} from "../../../ai/model";
import {
  getPlaygroundConversation,
  listThread,
  PlaygroundNotSeededError,
  resetPlayground,
} from "../../../server/playground";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 2000;

function fail(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

function toErrorResponse(err: unknown) {
  if (err instanceof PlaygroundNotSeededError) {
    return fail(503, "not_seeded", err.message);
  }
  if (err instanceof AiNotConfiguredError) {
    return fail(503, "ai_not_configured", err.message);
  }
  if (err instanceof ModelRefusedError || err instanceof EmptyReplyError) {
    return fail(502, "no_reply", err.message);
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return fail(502, "bad_api_key", "The API key was rejected. Check ANTHROPIC_API_KEY in .env.local.");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return fail(429, "rate_limited", "The AI service is rate limiting requests. Try again in a moment.");
  }
  if (err instanceof Anthropic.APIError) {
    return fail(502, "ai_error", `The AI service returned an error (${err.status}): ${err.message}`);
  }
  console.error("playground error", err);
  return fail(500, "internal", "Something went wrong. Check the server log.");
}

export async function GET() {
  try {
    const { business, conversation } = await getPlaygroundConversation();
    const thread = await listThread(business.id, conversation.id);
    return Response.json({
      business: { name: business.name },
      aiConfigured: Boolean(
        process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
      ),
      messages: thread,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_request", "Send JSON like {\"message\": \"...\"}.");
  }
  const text =
    typeof (body as { message?: unknown })?.message === "string"
      ? (body as { message: string }).message.trim()
      : "";
  if (!text) return fail(400, "empty_message", "Message is empty.");
  if (text.length > MAX_MESSAGE_LENGTH) {
    return fail(400, "too_long", `Message is longer than ${MAX_MESSAGE_LENGTH} characters.`);
  }

  try {
    // Fail before saving anything if the AI cannot run at all.
    const model = createChatModel();
    const { business, conversation } = await getPlaygroundConversation();
    const result = await handleCustomerMessage({
      businessId: business.id,
      conversationId: conversation.id,
      text,
      model,
    });
    return Response.json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE() {
  try {
    await resetPlayground();
    return Response.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
