"use client";

import { useState } from "react";
import { User } from "@prisma/client";

export default function UsersClient({ initialUsers }: { initialUsers: User[] }) {
    const [users, setUsers] = useState<User[]>(initialUsers);
    const [newUsername, setNewUsername] = useState("");
    const [isAdding, setIsAdding] = useState(false);

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUsername.trim()) return;
        setIsAdding(true);

        try {
            const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: newUsername.trim() }),
            });

            if (res.ok) {
                const newUser = await res.json();
                setUsers([newUser, ...users]);
                setNewUsername("");
            } else {
                alert("Failed to add user. Ensure username is unique.");
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsAdding(false);
        }
    };

    const toggleStatus = async (id: string, currentStatus: boolean) => {
        try {
            const res = await fetch("/api/admin/users", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, isActive: !currentStatus }),
            });

            if (res.ok) {
                const updatedUser = await res.json();
                setUsers(users.map(u => (u.id === id ? updatedUser : u)));
            }
        } catch (error) {
            console.error("Failed to toggle status", error);
        }
    };

    const deleteUser = async (id: string) => {
        if (!confirm("Are you sure you want to delete this user?")) return;

        try {
            const res = await fetch(`/api/admin/users?id=${id}`, {
                method: "DELETE",
            });

            if (res.ok) {
                setUsers(users.filter(u => u.id !== id));
            }
        } catch (error) {
            console.error("Failed to delete", error);
        }
    };

    return (
        <div className="space-y-6">
            {/* Add User Form */}
            <div className="bg-neutral-800 p-6 rounded-xl border border-neutral-700 shadow-sm">
                <h2 className="text-lg font-medium text-white mb-4">Add New User</h2>
                <form onSubmit={handleAddUser} className="flex gap-4">
                    <input
                        type="text"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        placeholder="Windows Username"
                        className="flex-1 h-10 rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                    />
                    <button
                        type="submit"
                        disabled={isAdding}
                        className="h-10 px-4 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                        {isAdding ? "Adding..." : "Add User"}
                    </button>
                </form>
            </div>

            {/* Users Table */}
            <div className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden shadow-sm">
                <table className="w-full text-sm text-left px-4">
                    <thead className="text-xs text-neutral-400 uppercase bg-neutral-900/50 border-b border-neutral-700">
                        <tr>
                            <th className="px-6 py-4 font-medium">Username</th>
                            <th className="px-6 py-4 font-medium">Status</th>
                            <th className="px-6 py-4 font-medium">Machine Name</th>
                            <th className="px-6 py-4 font-medium">Last Login</th>
                            <th className="px-6 py-4 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-neutral-500">
                                    No users found.
                                </td>
                            </tr>
                        ) : (
                            users.map((user) => (
                                <tr key={user.id} className="border-b border-neutral-700 hover:bg-neutral-700/30 transition-colors">
                                    <td className="px-6 py-4 font-medium text-white">{user.username}</td>
                                    <td className="px-6 py-4">
                                        <span
                                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${user.isActive ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                                                }`}
                                        >
                                            {user.isActive ? "Active" : "Disabled"}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-neutral-300">{user.machineName || "-"}</td>
                                    <td className="px-6 py-4 text-neutral-300">
                                        {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : "Never"}
                                    </td>
                                    <td className="px-6 py-4 text-right space-x-3">
                                        <button
                                            onClick={() => toggleStatus(user.id, user.isActive)}
                                            className="text-neutral-400 hover:text-white transition-colors"
                                        >
                                            {user.isActive ? "Disable" : "Enable"}
                                        </button>
                                        <button
                                            onClick={() => deleteUser(user.id)}
                                            className="text-red-500 hover:text-red-400 transition-colors"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
