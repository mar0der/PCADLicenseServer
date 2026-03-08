"use client";

import { useEffect, useState } from "react";
import type { Command, User } from "@prisma/client";

import DokaflexAccessPanel from "./DokaflexAccessPanel";

type DashboardUser = Pick<
  User,
  | "id"
  | "username"
  | "isActive"
  | "baseRole"
  | "accessLevel"
  | "machineName"
  | "lastMachineName"
  | "lastLogin"
  | "lastLoginAt"
>;

type DokaflexCommandOption = Pick<Command, "id" | "commandKey" | "displayName" | "stage">;

export default function UsersClient({
  initialUsers,
  initialDokaflexCommands,
}: {
  initialUsers: DashboardUser[];
  initialDokaflexCommands: DokaflexCommandOption[];
}) {
  const [users, setUsers] = useState<DashboardUser[]>(initialUsers);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [newAccessLevel, setNewAccessLevel] = useState(1);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  useEffect(() => {
    if (selectedUserId && !users.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(null);
    }
  }, [selectedUserId, users]);

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;

  async function handleAddUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newUsername.trim()) {
      return;
    }

    setIsAdding(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername.trim(),
          accessLevel: newAccessLevel,
        }),
      });

      if (!response.ok) {
        alert("Failed to add user. Ensure the username is unique.");
        return;
      }

      const newUser = (await response.json()) as DashboardUser;
      setUsers((currentUsers) => [newUser, ...currentUsers]);
      setSelectedUserId(newUser.id);
      setNewUsername("");
      setNewAccessLevel(1);
    } catch (error) {
      console.error("Failed to add user", error);
      alert("Failed to add user.");
    } finally {
      setIsAdding(false);
    }
  }

  async function toggleStatus(id: string, currentStatus: boolean) {
    try {
      const response = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive: !currentStatus }),
      });

      if (!response.ok) {
        alert("Failed to update user status.");
        return;
      }

      const updatedUser = (await response.json()) as DashboardUser;
      setUsers((currentUsers) =>
        currentUsers.map((user) => (user.id === id ? updatedUser : user))
      );
    } catch (error) {
      console.error("Failed to toggle status", error);
      alert("Failed to update user status.");
    }
  }

  async function changeAccessLevel(id: string, nextLevel: number) {
    try {
      const response = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, accessLevel: nextLevel }),
      });

      if (!response.ok) {
        alert("Failed to update access level.");
        return;
      }

      const updatedUser = (await response.json()) as DashboardUser;
      setUsers((currentUsers) =>
        currentUsers.map((user) => (user.id === id ? updatedUser : user))
      );
    } catch (error) {
      console.error("Failed to update access level", error);
      alert("Failed to update access level.");
    }
  }

  async function deleteUser(id: string) {
    if (!confirm("Are you sure you want to delete this user?")) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        alert("Failed to delete user.");
        return;
      }

      setUsers((currentUsers) => currentUsers.filter((user) => user.id !== id));
      setSelectedUserId((currentId) => (currentId === id ? null : currentId));
    } catch (error) {
      console.error("Failed to delete user", error);
      alert("Failed to delete user.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-neutral-800 p-6 rounded-xl border border-neutral-700 shadow-sm">
        <h2 className="text-lg font-medium text-white mb-4">Add New User</h2>
        <form onSubmit={handleAddUser} className="flex gap-4 flex-wrap md:flex-nowrap">
          <input
            type="text"
            value={newUsername}
            onChange={(event) => setNewUsername(event.target.value)}
            placeholder="Windows Username"
            className="flex-1 h-10 rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[220px]"
            required
          />
          <select
            value={newAccessLevel}
            onChange={(event) => setNewAccessLevel(Number(event.target.value))}
            className="h-10 rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={1}>User</option>
            <option value={2}>Tester</option>
            <option value={3}>Boss</option>
          </select>
          <button
            type="submit"
            disabled={isAdding}
            className="h-10 px-4 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isAdding ? "Adding..." : "Add User"}
          </button>
        </form>
      </div>

      <div className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-neutral-400 uppercase bg-neutral-900/50 border-b border-neutral-700">
            <tr>
              <th className="px-6 py-4 font-medium">Username</th>
              <th className="px-6 py-4 font-medium">Role</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium">Machine Name</th>
              <th className="px-6 py-4 font-medium">Last Login</th>
              <th className="px-6 py-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-neutral-500">
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const machineName = user.lastMachineName || user.machineName || "-";
                const lastLogin = user.lastLoginAt || user.lastLogin;
                const isSelected = user.id === selectedUserId;

                return (
                  <tr
                    key={user.id}
                    className={`border-b border-neutral-700 transition-colors ${
                      isSelected ? "bg-blue-500/10" : "hover:bg-neutral-700/30"
                    }`}
                  >
                    <td className="px-6 py-4 font-medium text-white">{user.username}</td>
                    <td className="px-6 py-4">
                      <select
                        value={user.accessLevel}
                        onChange={(event) => void changeAccessLevel(user.id, Number(event.target.value))}
                        className="bg-transparent border border-neutral-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value={1} className="bg-neutral-800">
                          User
                        </option>
                        <option value={2} className="bg-neutral-800">
                          Tester
                        </option>
                        <option value={3} className="bg-neutral-800">
                          Boss
                        </option>
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          user.isActive ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                        }`}
                      >
                        {user.isActive ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-neutral-300">{machineName}</td>
                    <td className="px-6 py-4 text-neutral-300">
                      {lastLogin ? new Date(lastLogin).toLocaleString() : "Never"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setSelectedUserId(user.id)}
                          className={`transition-colors ${
                            isSelected ? "text-blue-300" : "text-blue-400 hover:text-blue-300"
                          }`}
                        >
                          Customize Dokaflex
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleStatus(user.id, user.isActive)}
                          className="text-neutral-400 hover:text-white transition-colors"
                        >
                          {user.isActive ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteUser(user.id)}
                          className="text-red-500 hover:text-red-400 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedUser ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-6">
          <div className="relative max-h-[calc(100vh-3rem)] w-full max-w-7xl overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-950 shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-700 bg-neutral-950/95 px-6 py-4 backdrop-blur">
              <div>
                <h2 className="text-lg font-semibold text-white">Dokaflex Access</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  Editing Dokaflex access for{" "}
                  <span className="font-medium text-white">{selectedUser.username}</span>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUserId(null)}
                className="rounded-md border border-neutral-600 px-3 py-2 text-sm text-neutral-200 transition-colors hover:bg-neutral-800 hover:text-white"
              >
                Close
              </button>
            </div>

            <DokaflexAccessPanel user={selectedUser} dokaflexCommands={initialDokaflexCommands} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
