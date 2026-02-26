"use client";

import { useState } from "react";
import { Command } from "@prisma/client";

export default function CommandsClient({ initialCommands }: { initialCommands: Command[] }) {
    const [commands, setCommands] = useState<Command[]>(initialCommands);
    const [newUniqueName, setNewUniqueName] = useState("");
    const [newDescriptiveName, setNewDescriptiveName] = useState("");
    const [newAccessLevel, setNewAccessLevel] = useState(1);
    const [isAdding, setIsAdding] = useState(false);

    const handleAddCommand = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUniqueName.trim() || !newDescriptiveName.trim()) return;
        setIsAdding(true);

        try {
            const res = await fetch("/api/admin/commands", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    uniqueName: newUniqueName.trim(), 
                    descriptiveName: newDescriptiveName.trim(), 
                    requiredAccessLevel: newAccessLevel 
                }),
            });

            if (res.ok) {
                const newCmd = await res.json();
                setCommands([newCmd, ...commands]);
                setNewUniqueName("");
                setNewDescriptiveName("");
                setNewAccessLevel(1);
            } else {
                alert("Failed to add command. Ensure the programmatic name is unique.");
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsAdding(false);
        }
    };

    const changeAccessLevel = async (id: string, newLevel: number) => {
        try {
            const res = await fetch("/api/admin/commands", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, requiredAccessLevel: newLevel }),
            });

            if (res.ok) {
                const updatedCmd = await res.json();
                setCommands(commands.map(c => (c.id === id ? updatedCmd : c)));
            }
        } catch (error) {
            console.error("Failed to update access level", error);
        }
    };

    const deleteCommand = async (id: string) => {
        if (!confirm("Are you sure you want to delete this command? This will not delete usage logs, but will remove the descriptive name from the dashboard.")) return;

        try {
            const res = await fetch(`/api/admin/commands?id=${id}`, {
                method: "DELETE",
            });

            if (res.ok) {
                setCommands(commands.filter(c => c.id !== id));
            }
        } catch (error) {
            console.error("Failed to delete", error);
        }
    };

    return (
        <div className="space-y-6">
            {/* Add Command Form */}
            <div className="bg-neutral-800 p-6 rounded-xl border border-neutral-700 shadow-sm">
                <h2 className="text-lg font-medium text-white mb-4">Register New Command</h2>
                <form onSubmit={handleAddCommand} className="flex gap-4 flex-wrap md:flex-nowrap">
                    <input
                        type="text"
                        value={newUniqueName}
                        onChange={(e) => setNewUniqueName(e.target.value)}
                        placeholder="Programmatic Name (e.g. Dokaflex_Export)"
                        className="flex-1 h-10 rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
                        required
                    />
                    <input
                        type="text"
                        value={newDescriptiveName}
                        onChange={(e) => setNewDescriptiveName(e.target.value)}
                        placeholder="Descriptive Name (e.g. Export To Excel)"
                        className="flex-1 h-10 rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
                        required
                    />
                    <select
                        value={newAccessLevel}
                        onChange={(e) => setNewAccessLevel(Number(e.target.value))}
                        className="h-10 rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value={1}>User (Level 1)</option>
                        <option value={2}>Tester (Level 2)</option>
                        <option value={3}>Boss (Level 3)</option>
                    </select>
                    <button
                        type="submit"
                        disabled={isAdding}
                        className="h-10 px-4 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0"
                    >
                        {isAdding ? "Adding..." : "Add Command"}
                    </button>
                </form>
            </div>

            {/* Commands Table */}
            <div className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden shadow-sm">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-neutral-400 uppercase bg-neutral-900/50 border-b border-neutral-700">
                        <tr>
                            <th className="px-6 py-4 font-medium">Programmatic Name</th>
                            <th className="px-6 py-4 font-medium">Descriptive Name</th>
                            <th className="px-6 py-4 font-medium">Required Role</th>
                            <th className="px-6 py-4 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {commands.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-8 text-center text-neutral-500">
                                    No commands registered yet.
                                </td>
                            </tr>
                        ) : (
                            commands.map((cmd) => (
                                <tr key={cmd.id} className="border-b border-neutral-700 hover:bg-neutral-700/30 transition-colors">
                                    <td className="px-6 py-4 font-medium text-neutral-300 font-mono text-xs">{cmd.uniqueName}</td>
                                    <td className="px-6 py-4 font-medium text-white">{cmd.descriptiveName}</td>
                                    <td className="px-6 py-4">
                                        <select
                                            value={cmd.requiredAccessLevel}
                                            onChange={(e) => changeAccessLevel(cmd.id, Number(e.target.value))}
                                            className="bg-transparent border border-neutral-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        >
                                            <option value={1} className="bg-neutral-800">User</option>
                                            <option value={2} className="bg-neutral-800">Tester</option>
                                            <option value={3} className="bg-neutral-800">Boss</option>
                                        </select>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => deleteCommand(cmd.id)}
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
