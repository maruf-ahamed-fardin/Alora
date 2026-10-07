import { getPlaygroundBusiness } from "../../../../server/playground";
import { addExample } from "../../../../server/knowledge";
import { createEmbedder } from "../../../../knowledge/embedder";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: "bad_request", message: "Invalid JSON body." } },
      { status: 400 },
    );
  }

  const { customerMessage, suggestedReply } = (body ?? {}) as {
    customerMessage?: unknown;
    suggestedReply?: unknown;
  };

  if (typeof customerMessage !== "string" || !customerMessage.trim()) {
    return Response.json(
      { error: { code: "invalid_input", message: "customerMessage is required." } },
      { status: 400 },
    );
  }

  if (typeof suggestedReply !== "string" || !suggestedReply.trim()) {
    return Response.json(
      { error: { code: "invalid_input", message: "suggestedReply (emon howa uchit chilo) is required." } },
      { status: 400 },
    );
  }

  try {
    const business = await getPlaygroundBusiness();
    const embedder = createEmbedder();
    const example = await addExample(
      business.id,
      {
        customerMessage: customerMessage.trim(),
        reply: suggestedReply.trim(),
      },
      embedder,
    );

    return Response.json({
      success: true,
      example: {
        id: example.id,
        customerMessage: example.customerMessage,
        reply: example.reply,
      },
    });
  } catch (err) {
    console.error("Failed to add tone feedback example:", err);
    return Response.json(
      {
        error: {
          code: "internal_error",
          message: err instanceof Error ? err.message : "Failed to save feedback.",
        },
      },
      { status: 500 },
    );
  }
}
