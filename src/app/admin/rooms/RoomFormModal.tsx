"use client";

import { useState, useRef } from "react";
import { COMMON_AMENITIES, BED_TYPES } from "@/lib/constants";
import type { HotelRoom, RoomType } from "@/lib/db";

interface RoomFormModalProps {
  room?: HotelRoom | null;
  currency: string;
  groups: HotelRoom[]; // available group-type rooms for assignment
  onClose: () => void;
  onSaved: () => void;
}

function ImageUploadArea({
  label,
  images,
  roomId,
  onUploaded,
  onRemoved,
  multiple,
}: {
  label: string;
  images: string[];
  roomId: string;
  onUploaded: (url: string, path: string) => void;
  onRemoved: (url: string) => void;
  multiple?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(files: FileList) {
    setUploading(true);
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("roomId", roomId);
      try {
        const res = await fetch("/api/admin/rooms/upload", { method: "POST", body: formData });
        if (res.ok) {
          const { url, path } = await res.json();
          onUploaded(url, path);
        }
      } catch {
        // Silently skip failed uploads
      }
    }
    setUploading(false);
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>

      {/* Existing images */}
      {images.length > 0 && (
        <div className={`grid gap-2 mb-2 ${multiple ? "grid-cols-3" : "grid-cols-1"}`}>
          {images.map((url) => (
            <div key={url} className="relative group rounded-lg overflow-hidden border border-gray-200">
              <img src={url} alt="" className="w-full h-32 object-cover" />
              <button
                type="button"
                onClick={() => onRemoved(url)}
                className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                X
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload area */}
      {(multiple || images.length === 0) && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full border-2 border-dashed border-gray-300 rounded-lg p-4 text-center text-sm text-gray-500 hover:border-[#2D4A3E] hover:text-[#2D4A3E] transition-colors disabled:opacity-50"
        >
          {uploading ? "Uploading..." : multiple ? "Click to add images" : "Click to upload image"}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={multiple}
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
    </div>
  );
}

export function RoomFormModal({ room, currency, groups, onClose, onSaved }: RoomFormModalProps) {
  const isEdit = !!room;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: room?.name || "",
    bed_type: room?.bed_type || "Queen",
    occupancy: room?.occupancy || 2,
    size: room?.size || "",
    total_rooms: room?.total_rooms || 1,
    amenities: room?.amenities || [],
    description: room?.description || "",
    tagline: room?.tagline || "",
    price: room?.pricing_tiers?.[0]?.price || 0,
    room_type: (room?.room_type || "standard") as RoomType,
    group_id: room?.group_id || "",
  });

  // Track images separately — hero is a single URL, gallery is an array
  const [heroImage, setHeroImage] = useState<string>(room?.images?.hero || "");
  const [galleryImages, setGalleryImages] = useState<string[]>(room?.images?.gallery || []);
  // Track storage paths for deletion
  const [imagePaths, setImagePaths] = useState<Record<string, string>>({});

  function toggleAmenity(amenity: string) {
    setForm((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter((a) => a !== amenity)
        : [...prev.amenities, amenity],
    }));
  }

  async function removeImage(url: string, isHero: boolean) {
    // Remove from storage if we have the path
    const path = imagePaths[url];
    if (path) {
      try {
        await fetch("/api/admin/rooms/upload", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        });
      } catch {
        // Continue even if storage delete fails
      }
    }

    if (isHero) {
      setHeroImage("");
    } else {
      setGalleryImages((prev) => prev.filter((u) => u !== url));
    }

    // If editing, save immediately so the DB stays in sync
    if (isEdit) {
      const newImages = {
        hero: isHero ? undefined : (heroImage || undefined),
        gallery: isHero ? galleryImages : galleryImages.filter((u) => u !== url),
      };
      if (!newImages.gallery.length) delete (newImages as Record<string, unknown>).gallery;
      await fetch(`/api/admin/rooms/${room.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: newImages }),
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const url = isEdit ? `/api/admin/rooms/${room.id}` : "/api/admin/rooms";
      const method = isEdit ? "PUT" : "POST";

      const images: { hero?: string; gallery?: string[] } = {};
      if (heroImage) images.hero = heroImage;
      if (galleryImages.length > 0) images.gallery = galleryImages;

      const body = isEdit
        ? {
            name: form.name,
            bed_type: form.room_type === "group" ? null : form.bed_type,
            occupancy: form.occupancy,
            size: form.size || null,
            total_rooms: form.room_type === "individual" ? 1 : form.total_rooms,
            amenities: form.amenities,
            description: form.description || null,
            tagline: form.tagline || null,
            pricing_tiers: [{
              rooms: 1,
              price: Number(form.price),
              label: form.room_type === "group" ? "Entire House" : "1 Room",
            }],
            room_type: form.room_type,
            group_id: form.room_type === "individual" ? (form.group_id || null) : null,
            images,
          }
        : {
            ...form,
            room_type: form.room_type,
            group_id: form.room_type === "individual" ? (form.group_id || null) : null,
            images,
          };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save room");
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const isGroup = form.room_type === "group";
  const isIndividual = form.room_type === "individual";

  // For new rooms, we need a temporary ID for uploads; use existing room ID when editing
  const uploadRoomId = room?.id || "new";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {isEdit ? "Edit Room" : "Add Room"}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Room Type Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Room Type</label>
            <div className="flex gap-2">
              {([
                { value: "standard", label: "Standard", desc: "Room type with inventory count" },
                { value: "group", label: "Group", desc: "Whole-unit listing (e.g. Entire House)" },
                { value: "individual", label: "Individual", desc: "Specific room within a group" },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, room_type: opt.value }))}
                  className={`flex-1 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    form.room_type === opt.value
                      ? "border-[#2D4A3E] bg-[#2D4A3E]/5 text-[#2D4A3E]"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {form.room_type === "standard" && "Classic room type with count-based inventory (e.g. Standard Room x 10)"}
              {form.room_type === "group" && "A whole-unit listing that bundles individual rooms (e.g. Entire House)"}
              {form.room_type === "individual" && "A specific room within a group (e.g. Queen Room 1 in Aracuya House)"}
            </p>
          </div>

          {/* Group Assignment (only for individual rooms) */}
          {isIndividual && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Belongs to Group</label>
              <select
                value={form.group_id}
                onChange={(e) => setForm((f) => ({ ...f, group_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] focus:border-transparent"
              >
                <option value="">None (standalone)</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Room Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={isGroup ? "Aracuya House" : "Queen Room 1"}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] focus:border-transparent"
              />
            </div>
            {!isGroup && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bed Type</label>
                <select
                  value={form.bed_type}
                  onChange={(e) => setForm((f) => ({ ...f, bed_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] focus:border-transparent"
                >
                  {BED_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className={`grid gap-4 ${isIndividual ? "grid-cols-2" : "grid-cols-3"}`}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Occupancy</label>
              <input
                type="number"
                min={1}
                value={form.occupancy}
                onChange={(e) => setForm((f) => ({ ...f, occupancy: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
              <input
                type="text"
                value={form.size}
                onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
                placeholder="45 m2"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] focus:border-transparent"
              />
            </div>
            {/* Hide "Rooms of This Type" for individual rooms (always 1) */}
            {!isIndividual && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isGroup ? "Units Available" : "Rooms of This Type"}
                </label>
                <input
                  type="number"
                  min={1}
                  value={isGroup ? 1 : form.total_rooms}
                  onChange={(e) => setForm((f) => ({ ...f, total_rooms: Number(e.target.value) }))}
                  disabled={isGroup}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Price per Night ({currency})
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tagline</label>
            <input
              type="text"
              value={form.tagline}
              onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
              placeholder="Where comfort meets luxury"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="A brief description of the room..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] focus:border-transparent resize-none"
            />
          </div>

          {/* Images */}
          <div className="space-y-4 border-t border-gray-100 pt-5">
            <ImageUploadArea
              label="Hero Image"
              images={heroImage ? [heroImage] : []}
              roomId={uploadRoomId}
              onUploaded={(url, path) => {
                setHeroImage(url);
                setImagePaths((p) => ({ ...p, [url]: path }));
              }}
              onRemoved={(url) => removeImage(url, true)}
            />
            <ImageUploadArea
              label="Gallery Images"
              images={galleryImages}
              roomId={uploadRoomId}
              multiple
              onUploaded={(url, path) => {
                setGalleryImages((prev) => [...prev, url]);
                setImagePaths((p) => ({ ...p, [url]: path }));
              }}
              onRemoved={(url) => removeImage(url, false)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Amenities</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {COMMON_AMENITIES.map((amenity) => (
                <label key={amenity} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.amenities.includes(amenity)}
                    onChange={() => toggleAmenity(amenity)}
                    className="rounded border-gray-300 text-[#2D4A3E] focus:ring-[#2D4A3E]"
                  />
                  {amenity}
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors disabled:opacity-50"
            >
              {loading ? "Saving..." : isEdit ? "Save Changes" : "Add Room"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
