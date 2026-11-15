"use client";

import { useState } from "react";
import { TEMPLATE_TYPES } from "@/lib/constants";
import type { MessageTemplate } from "@/lib/db";
import { apiRequest } from "@/lib/admin/api-client";
import { useAdminAction, ErrorNotice } from "../useAdminAction";

interface TemplateEditorProps {
  templates: MessageTemplate[];
  sentCounts: Record<string, number>;
}

export function TemplateEditor({ templates, sentCounts }: TemplateEditorProps) {
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editActive, setEditActive] = useState(true);
  // Local copy so a save or toggle shows at once, without a page reload.
  const [templateMap, setTemplateMap] = useState(() => new Map(templates.map((t) => [t.template_type, t])));
  const { pending, busy, error, setError, run } = useAdminAction();
  const [savedNote, setSavedNote] = useState("");

  function startEdit(type: string) {
    const existing = templateMap.get(type);
    const defaultTemplate = TEMPLATE_TYPES.find((t) => t.type === type);
    setEditBody(existing?.body || defaultTemplate?.defaultBody || "");
    setEditActive(existing?.active ?? true);
    setEditingType(type);
    setError(null);
    setSavedNote("");
  }

  async function save(type: string, body: string, active: boolean, key: string, fallbackError: string) {
    const r = await run(key, () =>
      apiRequest<{ template?: MessageTemplate }>("/api/admin/templates", {
        method: "PUT",
        json: { templateType: type, body, active },
        fallbackError,
      })
    );
    if (r?.ok) {
      const tmpl = r.data.template;
      setTemplateMap((prev) => {
        const next = new Map(prev);
        const old = prev.get(type);
        next.set(type, tmpl ?? ({ ...(old ?? {}), template_type: type, body, active } as MessageTemplate));
        return next;
      });
    }
    return !!r?.ok;
  }

  async function handleSave() {
    if (!editingType) return;
    if (!editBody.trim()) {
      setError("The message can't be empty.");
      return;
    }
    const label = TEMPLATE_TYPES.find((t) => t.type === editingType)?.label ?? "Template";
    const ok = await save(editingType, editBody, editActive, "save", "We couldn't save this message. Your text is still here; please try again.");
    if (ok) {
      setEditingType(null);
      setSavedNote(`${label} saved.`);
    }
  }

  async function toggleActive(type: string) {
    const existing = templateMap.get(type);
    const defaultTemplate = TEMPLATE_TYPES.find((t) => t.type === type);
    const currentBody = existing?.body || defaultTemplate?.defaultBody || "";
    const newActive = !(existing?.active ?? true);
    const label = defaultTemplate?.label ?? "this message";
    setSavedNote("");
    await save(type, currentBody, newActive, `toggle:${type}`, `We couldn't turn ${label} ${newActive ? "on" : "off"}. Please try again.`);
  }

  return (
    <>
      {!editingType && <ErrorNotice message={error} onDismiss={() => setError(null)} className="mb-3" />}
      {savedNote && !editingType && (
        <p role="status" className="admin-success mb-3">
          {savedNote}
        </p>
      )}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Template</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Trigger</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Sent</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Active</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {TEMPLATE_TYPES.map((tmpl) => {
              const saved = templateMap.get(tmpl.type);
              const isActive = saved?.active ?? true;
              const count = sentCounts[tmpl.type] || 0;

              return (
                <tr key={tmpl.type} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{tmpl.label}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{tmpl.trigger}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{count}</td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => toggleActive(tmpl.type)}
                      disabled={busy}
                      aria-busy={pending === `toggle:${tmpl.type}`}
                      role="switch"
                      aria-checked={isActive}
                      aria-label={`${tmpl.label} active`}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:cursor-wait ${
                        isActive ? "bg-[#2D4A3E]" : "bg-[#868e9c]"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                          isActive ? "translate-x-4.5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => startEdit(tmpl.type)}
                      className="text-sm text-[#2D4A3E] hover:underline font-medium"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editingType && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="p-4 sm:p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Edit: {TEMPLATE_TYPES.find((t) => t.type === editingType)?.label}
              </h3>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              <div>
                <label htmlFor="templateed-message-body" className="admin-label">Message Body</label>
                <textarea
                  id="templateed-message-body"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={6}
                  className="admin-input resize-none"
                />
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Available placeholders:</p>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_TYPES.find((t) => t.type === editingType)?.placeholders.map((p) => (
                    <code
                      key={p}
                      className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded cursor-pointer hover:bg-gray-200"
                      onClick={() => setEditBody((b) => b + `{${p}}`)}
                    >
                      {`{${p}}`}
                    </code>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  className="rounded border-[#868e9c] text-[#2D4A3E] focus:ring-[#2D4A3E]"
                />
                Template active
              </label>

              <ErrorNotice message={error} onDismiss={() => setError(null)} />

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setEditingType(null);
                    setError(null);
                  }}
                  disabled={busy}
                  className="admin-btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={busy}
                  className="admin-btn-primary flex-1"
                >
                  {pending === "save" ? "Saving..." : "Save Template"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
