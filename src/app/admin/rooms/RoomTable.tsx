"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { HotelRoom } from "@/lib/db";
import { RoomFormModal } from "./RoomFormModal";

interface RoomTableProps {
  initialRooms: HotelRoom[];
  currency: string;
}

function RoomTypeBadge({ roomType }: { roomType: string }) {
  if (roomType === "group") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
        Group
      </span>
    );
  }
  if (roomType === "individual") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
        Individual
      </span>
    );
  }
  return null; // standard rooms don't need a badge
}

export function RoomTable({ initialRooms, currency }: RoomTableProps) {
  const router = useRouter();
  const [rooms, setRooms] = useState(initialRooms);
  const [showModal, setShowModal] = useState(false);
  const [editRoom, setEditRoom] = useState<HotelRoom | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Organize rooms: groups first with their members indented below, then standalone rooms
  const organizedRooms = useMemo(() => {
    const groups = rooms.filter(r => r.room_type === "group");
    const individuals = rooms.filter(r => r.room_type === "individual");
    const standards = rooms.filter(r => r.room_type === "standard");

    const result: { room: HotelRoom; indent: boolean }[] = [];

    for (const group of groups) {
      result.push({ room: group, indent: false });
      const members = individuals
        .filter(r => r.group_id === group.id)
        .sort((a, b) => a.position - b.position);
      for (const member of members) {
        result.push({ room: member, indent: true });
      }
    }

    // Ungrouped individual rooms (shouldn't normally exist, but handle gracefully)
    const groupedIds = new Set(individuals.filter(r => r.group_id).map(r => r.id));
    for (const ind of individuals) {
      if (!groupedIds.has(ind.id)) {
        result.push({ room: ind, indent: false });
      }
    }

    for (const std of standards) {
      result.push({ room: std, indent: false });
    }

    return result;
  }, [rooms]);

  const groupRooms = useMemo(() => rooms.filter(r => r.room_type === "group"), [rooms]);

  function handleAdd() {
    setEditRoom(null);
    setShowModal(true);
  }

  function handleEdit(room: HotelRoom) {
    setEditRoom(room);
    setShowModal(true);
  }

  function handleSaved() {
    setShowModal(false);
    setEditRoom(null);
    router.refresh();
    fetch("/api/admin/rooms")
      .then((r) => r.json())
      .then((data) => setRooms(data.rooms));
  }

  async function handleDelete(id: string) {
    await fetch(`/api/admin/rooms/${id}`, { method: "DELETE" });
    setDeleteConfirm(null);
    setRooms((prev) => prev.filter((r) => r.id !== id));
    router.refresh();
  }

  async function handleMove(index: number, direction: "up" | "down") {
    const newRooms = [...rooms];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newRooms.length) return;

    [newRooms[index], newRooms[targetIndex]] = [newRooms[targetIndex], newRooms[index]];
    setRooms(newRooms);

    await fetch("/api/admin/rooms/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: newRooms.map((r) => r.id) }),
    });
  }

  // Count stats
  const physicalRooms = rooms.filter(r => r.room_type !== "group").reduce((sum, r) => sum + r.total_rooms, 0);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Rooms</h2>
          <p className="text-sm text-gray-500 mt-1">
            {rooms.length} room{rooms.length !== 1 ? "s" : ""} &middot;{" "}
            {physicalRooms} bookable unit{physicalRooms !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="px-4 py-2.5 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors"
        >
          + Add Room
        </button>
      </div>

      {rooms.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <p className="text-gray-500 text-sm">No rooms configured yet.</p>
          <button
            onClick={handleAdd}
            className="mt-4 px-4 py-2 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] transition-colors"
          >
            Add Your First Room
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3 w-10"></th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Name</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Type</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Bed Type</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Occupancy</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Price/Night</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Amenities</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {organizedRooms.map(({ room, indent }) => {
                const originalIndex = rooms.findIndex(r => r.id === room.id);
                const memberCount = room.room_type === "group"
                  ? rooms.filter(r => r.group_id === room.id).length
                  : 0;

                return (
                  <tr
                    key={room.id}
                    className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${
                      indent ? "bg-gray-50/30" : ""
                    }`}
                  >
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={() => handleMove(originalIndex, "up")}
                          disabled={originalIndex === 0}
                          className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs leading-none"
                          title="Move up"
                        >
                          &#x25B2;
                        </button>
                        <button
                          onClick={() => handleMove(originalIndex, "down")}
                          disabled={originalIndex === rooms.length - 1}
                          className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs leading-none"
                          title="Move down"
                        >
                          &#x25BC;
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`${indent ? "pl-6" : ""}`}>
                        <div className="text-sm font-medium text-gray-900">
                          {indent && <span className="text-gray-300 mr-1">&#x2514;</span>}
                          {room.name}
                        </div>
                        {room.tagline && <div className="text-xs text-gray-500">{room.tagline}</div>}
                        {room.room_type === "group" && memberCount > 0 && (
                          <div className="text-xs text-purple-600 mt-0.5">
                            {memberCount} room{memberCount !== 1 ? "s" : ""} in group
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <RoomTypeBadge roomType={room.room_type} />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{room.bed_type || "---"}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{room.occupancy}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {room.pricing_tiers?.[0]?.price
                        ? `${currency} ${room.pricing_tiers[0].price}`
                        : "---"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{room.amenities?.length || 0}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(room)}
                          className="text-sm text-[#2D4A3E] hover:underline font-medium"
                        >
                          Edit
                        </button>
                        {deleteConfirm === room.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(room.id)}
                              className="text-sm text-red-600 hover:underline font-medium"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="text-sm text-gray-500 hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(room.id)}
                            className="text-sm text-red-500 hover:underline font-medium"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <RoomFormModal
          room={editRoom}
          currency={currency}
          groups={groupRooms}
          onClose={() => { setShowModal(false); setEditRoom(null); }}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
