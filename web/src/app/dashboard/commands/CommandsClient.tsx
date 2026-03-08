"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Command } from "@prisma/client";

type BootstrapFeedback =
  | {
      tone: "success";
      message: string;
    }
  | {
      tone: "error";
      message: string;
    }
  | null;

export default function CommandsClient({ initialCommands }: { initialCommands: Command[] }) {
  const router = useRouter();
  const [commands, setCommands] = useState<Command[]>(initialCommands);
  const [newUniqueName, setNewUniqueName] = useState("");
  const [newDescriptiveName, setNewDescriptiveName] = useState("");
  const [newAccessLevel, setNewAccessLevel] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [bootstrapFeedback, setBootstrapFeedback] = useState<BootstrapFeedback>(null);

  useEffect(() => {
    setCommands(initialCommands);
  }, [initialCommands]);

  async function handleDokaflexBootstrap() {
    setIsBootstrapping(true);
    setBootstrapFeedback(null);

    try {
      const response = await fetch("/api/admin/bootstrap/dokaflex", {
        method: "POST",
      });

      if (!response.ok) {
        const errorMessage = await readErrorMessage(response, "Dokaflex bootstrap failed.");
        setBootstrapFeedback({
          tone: "error",
          message: errorMessage,
        });
        return;
      }

      const payload = (await response.json()) as {
        createdCount: number;
        existingCount: number;
      };

      setBootstrapFeedback({
        tone: "success",
        message: `Dokaflex bootstrap completed. Created ${payload.createdCount} command(s), ${payload.existingCount} already existed.`,
      });
      router.refresh();
    } catch (error) {
      console.error("Failed to bootstrap Dokaflex commands", error);
      setBootstrapFeedback({
        tone: "error",
        message: "Dokaflex bootstrap failed.",
      });
    } finally {
      setIsBootstrapping(false);
    }
  }

  async function handleAddCommand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newUniqueName.trim() || !newDescriptiveName.trim()) {
      return;
    }

    setIsAdding(true);

    try {
      const response = await fetch("/api/admin/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uniqueName: newUniqueName.trim(),
          descriptiveName: newDescriptiveName.trim(),
          requiredAccessLevel: newAccessLevel,
        }),
      });

      if (!response.ok) {
        alert("Failed to add command. Ensure the programmatic name is unique.");
        return;
      }

      const newCommand = (await response.json()) as Command;
      setCommands((currentCommands) => [newCommand, ...currentCommands]);
      setNewUniqueName("");
      setNewDescriptiveName("");
      setNewAccessLevel(1);
    } catch (error) {
      console.error("Failed to add command", error);
      alert("Failed to add command.");
    } finally {
      setIsAdding(false);
    }
  }

  async function changeAccessLevel(id: string, nextLevel: number) {
    try {
      const response = await fetch("/api/admin/commands", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, requiredAccessLevel: nextLevel }),
      });

      if (!response.ok) {
        alert("Failed to update command access level.");
        return;
      }

      const updatedCommand = (await response.json()) as Command;
      setCommands((currentCommands) =>
        currentCommands.map((command) => (command.id === id ? updatedCommand : command))
      );
    } catch (error) {
      console.error("Failed to update access level", error);
      alert("Failed to update command access level.");
    }
  }

  async function deleteCommand(id: string) {
    if (
      !confirm(
        "Are you sure you want to delete this command? This will not delete usage logs, but it will remove the metadata from the dashboard."
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/commands?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        alert("Failed to delete command.");
        return;
      }

      setCommands((currentCommands) => currentCommands.filter((command) => command.id !== id));
    } catch (error) {
      console.error("Failed to delete command", error);
      alert("Failed to delete command.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-neutral-800 p-6 rounded-xl border border-neutral-700 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">Dokaflex Bootstrap</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Seed the Dokaflex command catalog for local live testing. Safe to run multiple times.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleDokaflexBootstrap()}
            disabled={isBootstrapping}
            className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {isBootstrapping ? "Bootstrapping..." : "Bootstrap Dokaflex"}
          </button>
        </div>

        {bootstrapFeedback ? (
          <div
            className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
              bootstrapFeedback.tone === "success"
                ? "border-green-500/30 bg-green-500/10 text-green-300"
                : "border-red-500/30 bg-red-500/10 text-red-300"
            }`}
          >
            {bootstrapFeedback.message}
          </div>
        ) : null}
      </div>

      <div className="bg-neutral-800 p-6 rounded-xl border border-neutral-700 shadow-sm">
        <h2 className="text-lg font-medium text-white mb-4">Register New Command</h2>
        <form onSubmit={handleAddCommand} className="flex gap-4 flex-wrap md:flex-nowrap">
          <input
            type="text"
            value={newUniqueName}
            onChange={(event) => setNewUniqueName(event.target.value)}
            placeholder="Programmatic Name (e.g. DF.GENERATE_BEAM)"
            className="flex-1 h-10 rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[220px]"
            required
          />
          <input
            type="text"
            value={newDescriptiveName}
            onChange={(event) => setNewDescriptiveName(event.target.value)}
            placeholder="Descriptive Name (e.g. Generate Beam)"
            className="flex-1 h-10 rounded-md border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[220px]"
            required
          />
          <select
            value={newAccessLevel}
            onChange={(event) => setNewAccessLevel(Number(event.target.value))}
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

      <div className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-neutral-400 uppercase bg-neutral-900/50 border-b border-neutral-700">
            <tr>
              <th className="px-6 py-4 font-medium">Programmatic Name</th>
              <th className="px-6 py-4 font-medium">Descriptive Name</th>
              <th className="px-6 py-4 font-medium">Plugin</th>
              <th className="px-6 py-4 font-medium">Stage</th>
              <th className="px-6 py-4 font-medium">Required Role</th>
              <th className="px-6 py-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {commands.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-neutral-500">
                  No commands registered yet.
                </td>
              </tr>
            ) : (
              commands.map((command) => (
                <tr key={command.id} className="border-b border-neutral-700 hover:bg-neutral-700/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-neutral-300 font-mono text-xs">{command.uniqueName}</td>
                  <td className="px-6 py-4 font-medium text-white">{command.descriptiveName}</td>
                  <td className="px-6 py-4 text-neutral-300">{command.pluginSlug}</td>
                  <td className="px-6 py-4 text-neutral-300">{command.stage}</td>
                  <td className="px-6 py-4">
                    <select
                      value={command.requiredAccessLevel}
                      onChange={(event) => void changeAccessLevel(command.id, Number(event.target.value))}
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
                  <td className="px-6 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => void deleteCommand(command.id)}
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

async function readErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message || fallbackMessage;
  } catch {
    try {
      const text = await response.text();
      return text || fallbackMessage;
    } catch {
      return fallbackMessage;
    }
  }
}
