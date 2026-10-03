import { createEmbedder } from "../../../knowledge/embedder";
import { DocumentNotFoundError } from "../../../knowledge/indexing";
import {
  addDocument,
  addExample,
  deleteDocument,
  deleteExample,
  listKnowledge,
  NotFoundError,
  updateDocument,
  ValidationError,
} from "../../../server/knowledge";
import {
  getPlaygroundBusiness,
  PlaygroundNotSeededError,
} from "../../../server/playground";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

function toErrorResponse(err: unknown) {
  if (err instanceof ValidationError) return fail(400, "invalid", err.message);
  if (err instanceof NotFoundError || err instanceof DocumentNotFoundError) {
    return fail(404, "not_found", err.message);
  }
  if (err instanceof PlaygroundNotSeededError) return fail(503, "not_seeded", err.message);
  console.error("knowledge error", err);
  return fail(500, "internal", "Something went wrong. Check the server log.");
}

async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const business = await getPlaygroundBusiness();
    return Response.json(await listKnowledge(business.id));
  } catch (err) {
    return toErrorResponse(err);
  }
}

// Body: { type: "document", kind, title, content } or { type: "example", customerMessage, reply }
export async function POST(request: Request) {
  const body = await jsonBody(request);
  if (!body) return fail(400, "bad_request", "Send a JSON object.");
  try {
    const business = await getPlaygroundBusiness();
    const embedder = createEmbedder();
    if (body.type === "document") {
      return Response.json(await addDocument(business.id, body, embedder), { status: 201 });
    }
    if (body.type === "example") {
      return Response.json(await addExample(business.id, body, embedder), { status: 201 });
    }
    return fail(400, "invalid", 'type must be "document" or "example".');
  } catch (err) {
    return toErrorResponse(err);
  }
}

// Body: { id, kind, title, content } (documents only)
export async function PUT(request: Request) {
  const body = await jsonBody(request);
  if (!body || typeof body.id !== "string" || !UUID.test(body.id)) {
    return fail(400, "bad_request", "A valid id is required.");
  }
  try {
    const business = await getPlaygroundBusiness();
    return Response.json(await updateDocument(business.id, body.id, body, createEmbedder()));
  } catch (err) {
    return toErrorResponse(err);
  }
}

// ?type=document|example&id=...
export async function DELETE(request: Request) {
  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  const id = params.get("id");
  if (!id || !UUID.test(id) || (type !== "document" && type !== "example")) {
    return fail(400, "bad_request", "type (document or example) and a valid id are required.");
  }
  try {
    const business = await getPlaygroundBusiness();
    if (type === "document") await deleteDocument(business.id, id);
    else await deleteExample(business.id, id);
    return Response.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
