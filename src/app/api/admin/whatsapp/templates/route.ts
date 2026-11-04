import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin/auth";
import { getHotelById } from "@/lib/db";
import { GraphError } from "@/lib/whatsapp/graph";
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  WhatsAppNotConnectedError,
  type CreateTemplateInput,
} from "@/lib/whatsapp/templates";

async function hotelForRequest() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const hotel = await getHotelById(session.hotelId);
  if (!hotel) return { error: NextResponse.json({ error: "Hotel not found" }, { status: 404 }) };
  return { hotel };
}

function errorResponse(err: unknown) {
  if (err instanceof WhatsAppNotConnectedError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof GraphError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status >= 500 ? 502 : 400 });
  }
  console.error("WhatsApp templates error:", err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

/** GET — list the hotel's Meta message templates with their review status */
export async function GET() {
  const { hotel, error } = await hotelForRequest();
  if (error) return error;
  try {
    return NextResponse.json({ templates: await listTemplates(hotel) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST — submit a new template to Meta for review */
export async function POST(request: NextRequest) {
  const { hotel, error } = await hotelForRequest();
  if (error) return error;

  const input = (await request.json()) as CreateTemplateInput;
  if (!input.name?.trim() || !input.body?.trim() || !input.language || !input.category) {
    return NextResponse.json({ error: "Name, language, category and body are required" }, { status: 400 });
  }
  if (!["MARKETING", "UTILITY"].includes(input.category)) {
    return NextResponse.json({ error: "Category must be MARKETING or UTILITY" }, { status: 400 });
  }

  try {
    return NextResponse.json(await createTemplate(hotel, input));
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE ?name= — delete a template (all languages) */
export async function DELETE(request: NextRequest) {
  const { hotel, error } = await hotelForRequest();
  if (error) return error;
  const name = request.nextUrl.searchParams.get("name");
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });
  try {
    return NextResponse.json(await deleteTemplate(hotel, name));
  } catch (err) {
    return errorResponse(err);
  }
}
