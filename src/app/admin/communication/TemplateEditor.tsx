"use client";

import { useState } from "react";
import { TEMPLATE_TYPES } from "@/lib/constants";
import type { MessageTemplate } from "@/lib/db";

interface TemplateEditorProps {
  templates: MessageTemplate[];
  sentCounts: Record<string, number>;
}

export function TemplateEditor({ templates, sentCounts }: TemplateEditorProps) {
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const templateMap = new Map(templates.map((t) => [t.template_type, t]));

  function startEdit(type: string) {
    const existing = templateMap.get(type);
    const defaultTemplate = TEMPLATE_TYPES.find((t) => t.type === type);
    setEditBody(existing?.body || defaultTemplate?.defaultBody || "");
    setEditActive(existing?.active ?? true);
    setEditingType(type);
    setMsg("");
  }

  async function handleSave() {
    if (!editingType) return;
    setSaving(true);
    setMsg("");

    try {
      const res = await fetch("/api/admin/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateType: editingType,
          body: editBody,
          active: editActive,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");
      setMsg("Saved successfully");
      // Update local map
      const data = await res.json();
      if (data.template) {
        templateMap.set(editingType, data.template);
      }
      setEditingType(null);
    } catch {
      setMsg("Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(type: string) {
    const existing = templateMap.get(type);
    const defaultTemplate = TEMPLATE_TYPES.find((t) => t.type === type);
    const currentBody = existing?.body || defaultTemplate?.defaultBody || "";
    const newActive = !(existing?.active ?? true);

    try {
      await fetch("/api/admin/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateType: type,
          body: currentBody,
          active: newActive,
        }),
      });
      // Force refresh
      window.location.reload();
    } catch {
      // Silently fail
    }
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
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
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        isActive ? "bg-[#2D4A3E]" : "bg-gray-300"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Edit: {TEMPLATE_TYPES.find((t) => t.type === editingType)?.label}
              </h3>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message Body</label>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] focus:border-transparent resize-none"
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
                  className="rounded border-gray-300 text-[#2D4A3E] focus:ring-[#2D4A3E]"
                />
                Template active
              </label>

              {msg && (
                <p className={`text-sm ${msg.includes("success") ? "text-green-600" : "text-red-600"}`}>{msg}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setEditingType(null)}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-2.5 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Template"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
