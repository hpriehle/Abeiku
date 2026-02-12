import { redirect } from "next/navigation";
import { getSession } from "@/lib/admin/auth";
import { getHotelById, getMessageTemplates, getTemplateSentCounts } from "@/lib/db";
import { TemplateEditor } from "../TemplateEditor";

export default async function TemplatesPage() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const [hotel, templates, sentCounts] = await Promise.all([
    getHotelById(session.hotelId),
    getMessageTemplates(session.hotelId),
    getTemplateSentCounts(session.hotelId),
  ]);

  const waConnected = !!hotel?.whatsapp_access_token;

  return (
    <>
      {/* WhatsApp Status */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💬</span>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">WhatsApp Cloud API</h3>
              <p className="text-xs text-gray-500">
                {waConnected
                  ? `Connected - Phone ID: ${hotel?.whatsapp_phone_number_id}`
                  : "Not configured"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${waConnected ? "bg-green-500" : "bg-yellow-400"}`}
            />
            <span className={`text-sm font-medium ${waConnected ? "text-green-600" : "text-yellow-600"}`}>
              {waConnected ? "Connected" : "Not configured"}
            </span>
          </div>
        </div>
        {!waConnected && (
          <p className="text-sm text-gray-500 mt-3">
            Configure WhatsApp in{" "}
            <a href="/admin/settings" className="text-[#2D4A3E] hover:underline font-medium">Settings</a>
            {" "}to enable messaging.
          </p>
        )}
      </div>

      {/* Message Templates */}
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Message Templates</h3>
      <p className="text-sm text-gray-500 mb-4">
        Customize the automated messages sent to guests. Use placeholders like {"{guest_name}"} and {"{hotel_name}"} for dynamic content.
      </p>

      <TemplateEditor templates={templates} sentCounts={sentCounts} />
    </>
  );
}
