"use client";

import { useEffect, useState } from "react";
import type {
  BaseRole,
  Command,
  User,
  UserCommandOverrideEffect,
} from "@prisma/client";

import type { ResolvedCommandAccess } from "@/lib/access-control/resolveEffectiveAllowedCommandKeys";
import {
  buildDokaflexUserSurfaceSummary,
  buildPreviewDisplayRows,
  validateOverrideDeleteId,
  validateOverrideForm,
  type OverrideFormInput,
} from "@/lib/dashboard/dokaflexAdmin";

type DokaflexCommandOption = Pick<Command, "id" | "commandKey" | "displayName" | "stage">;
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

type OverrideRecord = {
  id: string;
  commandKey: string;
  effect: UserCommandOverrideEffect;
  expiresAt: string | null;
  reason: string | null;
  createdAt: string;
};

type AccessPreview = {
  pluginSlug: string;
  username: string;
  baseRole: BaseRole;
  isActive: boolean;
  allowedCommandKeys: string[];
  commandAccess: ResolvedCommandAccess[];
};

type FeedbackState = {
  tone: "success" | "error" | "info";
  message: string;
};

const DOKAFLEX_PLUGIN_SLUG = "dokaflex";

export default function DokaflexAccessPanel({
  user,
  dokaflexCommands,
  onUserUpdated,
}: {
  user: DashboardUser;
  dokaflexCommands: DokaflexCommandOption[];
  onUserUpdated: (user: DashboardUser) => void;
}) {
  const [overrides, setOverrides] = useState<OverrideRecord[]>([]);
  const [preview, setPreview] = useState<AccessPreview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const [deletingOverrideId, setDeletingOverrideId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [roleDraft, setRoleDraft] = useState<BaseRole>(user.baseRole);
  const [form, setForm] = useState<OverrideFormInput>({
    commandKey: dokaflexCommands[0]?.commandKey ?? "",
    effect: "GRANT",
    expiresAtLocal: "",
    reason: "",
  });

  useEffect(() => {
    setRoleDraft(user.baseRole);
  }, [user.baseRole, user.id]);

  useEffect(() => {
    if (!form.commandKey && dokaflexCommands[0]) {
      setForm((currentForm) => ({
        ...currentForm,
        commandKey: dokaflexCommands[0]?.commandKey ?? "",
      }));
    }
  }, [dokaflexCommands, form.commandKey]);

  useEffect(() => {
    let isCancelled = false;

    async function loadAccessState() {
      setIsLoading(true);
      setFeedback(null);

      try {
        const [overridesResponse, previewResponse] = await Promise.all([
          fetch(
            `/api/admin/overrides?username=${encodeURIComponent(user.username)}&pluginSlug=${DOKAFLEX_PLUGIN_SLUG}`,
            { cache: "no-store" }
          ),
          fetch("/api/admin/access-preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username: user.username,
              pluginSlug: DOKAFLEX_PLUGIN_SLUG,
            }),
          }),
        ]);

        if (!overridesResponse.ok) {
          throw new Error(await readErrorMessage(overridesResponse, "Failed to load Dokaflex overrides."));
        }

        if (!previewResponse.ok) {
          throw new Error(await readErrorMessage(previewResponse, "Failed to load effective access preview."));
        }

        const overridesPayload = (await overridesResponse.json()) as {
          overrides: OverrideRecord[];
        };
        const previewPayload = (await previewResponse.json()) as AccessPreview;

        if (!isCancelled) {
          setOverrides(overridesPayload.overrides);
          setPreview(previewPayload);
        }
      } catch (error) {
        if (!isCancelled) {
          setFeedback({
            tone: "error",
            message: error instanceof Error ? error.message : "Failed to load Dokaflex access state.",
          });
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadAccessState();

    return () => {
      isCancelled = true;
    };
  }, [user.baseRole, user.id, user.isActive, user.username]);

  const previewRows = preview
    ? buildPreviewDisplayRows({
        baseRole: preview.baseRole,
        commandAccess: preview.commandAccess,
      })
    : [];

  const availableCommandKeys = dokaflexCommands.map((command) => command.commandKey);
  const userSummary = buildDokaflexUserSurfaceSummary(user);

  async function handleRoleUpdate() {
    if (roleDraft === user.baseRole) {
      setFeedback({
        tone: "info",
        message: `${user.username} is already using the ${user.baseRole} base role.`,
      });
      return;
    }

    await updateUser(
      {
        id: user.id,
        baseRole: roleDraft,
      },
      `Base role for ${user.username} updated to ${roleDraft}. Effective Dokaflex access was reloaded.`
    );
  }

  async function handleStatusToggle() {
    await updateUser(
      {
        id: user.id,
        isActive: !user.isActive,
      },
      user.isActive
        ? `${user.username} is now disabled. Dokaflex access preview was refreshed and should block all commands.`
        : `${user.username} is now active again. Dokaflex access preview was refreshed.`
    );
  }

  async function handleCreateOverride(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validation = validateOverrideForm(form, availableCommandKeys);
    if (!validation.ok) {
      setFeedback({
        tone: "error",
        message: validation.errors.join(" "),
      });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/admin/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: user.username,
          pluginSlug: DOKAFLEX_PLUGIN_SLUG,
          commandKey: validation.value.commandKey,
          effect: validation.value.effect,
          expiresAt: validation.value.expiresAt,
          reason: validation.value.reason,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Failed to create Dokaflex override."));
      }

      await refreshAccessState();
      setForm({
        commandKey: validation.value.commandKey,
        effect: "GRANT",
        expiresAtLocal: "",
        reason: "",
      });
      setFeedback({
        tone: "success",
        message: `Saved a ${validation.value.effect} override for ${user.username} on ${validation.value.commandKey}. Effective Dokaflex access was refreshed.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to create Dokaflex override.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteOverride(overrideId: string) {
    const validationError = validateOverrideDeleteId(overrideId);
    if (validationError) {
      setFeedback({
        tone: "error",
        message: validationError,
      });
      return;
    }

    setDeletingOverrideId(overrideId);
    setFeedback(null);

    try {
      const response = await fetch(`/api/admin/overrides?id=${encodeURIComponent(overrideId)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Failed to delete Dokaflex override."));
      }

      await refreshAccessState();
      setFeedback({
        tone: "success",
        message: `Removed the Dokaflex override for ${user.username}. Effective access was refreshed.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to delete Dokaflex override.",
      });
    } finally {
      setDeletingOverrideId(null);
    }
  }

  async function refreshAccessState() {
    const [overridesResponse, previewResponse] = await Promise.all([
      fetch(
        `/api/admin/overrides?username=${encodeURIComponent(user.username)}&pluginSlug=${DOKAFLEX_PLUGIN_SLUG}`,
        { cache: "no-store" }
      ),
      fetch("/api/admin/access-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: user.username,
          pluginSlug: DOKAFLEX_PLUGIN_SLUG,
        }),
      }),
    ]);

    if (!overridesResponse.ok) {
      throw new Error(await readErrorMessage(overridesResponse, "Failed to refresh Dokaflex overrides."));
    }

    if (!previewResponse.ok) {
      throw new Error(await readErrorMessage(previewResponse, "Failed to refresh effective access preview."));
    }

    const overridesPayload = (await overridesResponse.json()) as {
      overrides: OverrideRecord[];
    };
    const previewPayload = (await previewResponse.json()) as AccessPreview;

    setOverrides(overridesPayload.overrides);
    setPreview(previewPayload);
  }

  async function updateUser(
    payload: { id: string; baseRole?: BaseRole; isActive?: boolean },
    successMessage: string
  ) {
    setIsUpdatingUser(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Failed to update Dokaflex user settings."));
      }

      const updatedUser = (await response.json()) as DashboardUser;
      onUserUpdated(updatedUser);
      await refreshAccessState();
      setFeedback({
        tone: "success",
        message: successMessage,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to update Dokaflex user settings.",
      });
    } finally {
      setIsUpdatingUser(false);
    }
  }

  return (
    <section className="bg-neutral-800 rounded-xl border border-neutral-700 shadow-sm">
      <div className="border-b border-neutral-700 px-6 py-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Customize Dokaflex For {user.username}
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              One editing surface for role, active state, overrides, and effective Dokaflex access
              for the selected user.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="neutral">Plugin: {DOKAFLEX_PLUGIN_SLUG}</Badge>
            <Badge tone="neutral">{userSummary.roleLabel}</Badge>
            <Badge tone={userSummary.statusTone === "success" ? "success" : "error"}>
              {userSummary.statusLabel}
            </Badge>
          </div>
        </div>
      </div>

      <div className="space-y-6 p-6">
        {feedback ? (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              feedback.tone === "success"
                ? "border-green-500/30 bg-green-500/10 text-green-300"
                : feedback.tone === "error"
                  ? "border-red-500/30 bg-red-500/10 text-red-300"
                  : "border-blue-500/30 bg-blue-500/10 text-blue-300"
            }`}
          >
            {feedback.message}
          </div>
        ) : null}

        {isLoading ? (
          <div className="rounded-lg border border-neutral-700 bg-neutral-900/40 px-4 py-6 text-sm text-neutral-400">
            Loading Dokaflex access state...
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Username" value={userSummary.username} />
                <SummaryCard label="Status" value={userSummary.statusLabel} />
                <SummaryCard label="Base Role" value={user.baseRole} />
                <SummaryCard label="Last Machine" value={userSummary.machineLabel} />
              </div>

              <div className="rounded-lg border border-neutral-700 bg-neutral-900/40 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">User Controls</h3>
                    <p className="mt-1 text-sm text-neutral-400">
                      Update role and active state for {user.username} without leaving this Dokaflex
                      surface.
                    </p>
                    <p className="mt-2 text-xs text-neutral-500">
                      Last successful verification: {userSummary.lastLoginLabel}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <label className="space-y-2 text-sm">
                      <span className="text-neutral-300">Base role</span>
                      <select
                        value={roleDraft}
                        onChange={(event) => setRoleDraft(event.target.value as BaseRole)}
                        className="h-10 min-w-[180px] rounded-md border border-neutral-600 bg-neutral-700 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="USER">USER</option>
                        <option value="TESTER">TESTER</option>
                        <option value="BOSS">BOSS</option>
                      </select>
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void handleRoleUpdate()}
                        disabled={isUpdatingUser}
                        className="inline-flex h-10 items-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isUpdatingUser ? "Updating..." : "Save Role"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleStatusToggle()}
                        disabled={isUpdatingUser}
                        className="inline-flex h-10 items-center rounded-md border border-neutral-600 bg-neutral-700 px-4 text-sm font-medium text-white transition-colors hover:border-neutral-500 disabled:opacity-50"
                      >
                        {isUpdatingUser
                          ? "Updating..."
                          : user.isActive
                            ? "Disable User"
                            : "Enable User"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-neutral-700 bg-neutral-900/40">
                <div className="border-b border-neutral-700 px-4 py-3">
                  <h3 className="text-sm font-semibold text-white">Current Overrides</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-neutral-700 text-left text-xs uppercase text-neutral-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">Command</th>
                        <th className="px-4 py-3 font-medium">Effect</th>
                        <th className="px-4 py-3 font-medium">Expiry</th>
                        <th className="px-4 py-3 font-medium">Reason</th>
                        <th className="px-4 py-3 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overrides.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                            No Dokaflex overrides for this user.
                          </td>
                        </tr>
                      ) : (
                        overrides.map((override) => (
                          <tr key={override.id} className="border-b border-neutral-800 last:border-b-0">
                            <td className="px-4 py-3 font-mono text-xs text-blue-300">
                              {override.commandKey}
                            </td>
                            <td className="px-4 py-3">
                              <Badge tone={override.effect === "GRANT" ? "success" : "error"}>
                                {override.effect}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-neutral-300">
                              {override.expiresAt ? new Date(override.expiresAt).toLocaleString() : "No expiry"}
                            </td>
                            <td className="px-4 py-3 text-neutral-300">
                              {override.reason || <span className="text-neutral-500">-</span>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => void handleDeleteOverride(override.id)}
                                disabled={deletingOverrideId === override.id}
                                className="text-sm font-medium text-red-400 transition-colors hover:text-red-300 disabled:opacity-50"
                              >
                                {deletingOverrideId === override.id ? "Deleting..." : "Delete"}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border border-neutral-700 bg-neutral-900/40 p-4">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-white">Add Override</h3>
                  <p className="mt-1 text-sm text-neutral-400">
                    Grant or deny a specific Dokaflex command without changing the user&apos;s base role.
                  </p>
                </div>

                {dokaflexCommands.length === 0 ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                    No Dokaflex commands are registered yet. Run the Dokaflex bootstrap from the Commands page first.
                  </div>
                ) : (
                  <form onSubmit={handleCreateOverride} className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2 text-sm">
                      <span className="text-neutral-300">Command key</span>
                      <select
                        value={form.commandKey}
                        onChange={(event) =>
                          setForm((currentForm) => ({
                            ...currentForm,
                            commandKey: event.target.value,
                          }))
                        }
                        className="h-10 w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {dokaflexCommands.map((command) => (
                          <option key={command.id} value={command.commandKey}>
                            {command.commandKey} ({command.stage})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2 text-sm">
                      <span className="text-neutral-300">Effect</span>
                      <select
                        value={form.effect}
                        onChange={(event) =>
                          setForm((currentForm) => ({
                            ...currentForm,
                            effect: event.target.value,
                          }))
                        }
                        className="h-10 w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="GRANT">GRANT</option>
                        <option value="DENY">DENY</option>
                      </select>
                    </label>

                    <label className="space-y-2 text-sm">
                      <span className="text-neutral-300">Expiry (optional)</span>
                      <input
                        type="datetime-local"
                        value={form.expiresAtLocal}
                        onChange={(event) =>
                          setForm((currentForm) => ({
                            ...currentForm,
                            expiresAtLocal: event.target.value,
                          }))
                        }
                        className="h-10 w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </label>

                    <label className="space-y-2 text-sm">
                      <span className="text-neutral-300">Reason (optional)</span>
                      <input
                        type="text"
                        value={form.reason}
                        onChange={(event) =>
                          setForm((currentForm) => ({
                            ...currentForm,
                            reason: event.target.value,
                          }))
                        }
                        placeholder="Local live test note"
                        className="h-10 w-full rounded-md border border-neutral-600 bg-neutral-700 px-3 text-sm text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </label>

                    <div className="md:col-span-2 flex justify-end">
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="inline-flex h-10 items-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isSaving ? "Saving..." : "Save Override"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-lg border border-neutral-700 bg-neutral-900/40 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Effective Access Preview</h3>
                    <p className="mt-1 text-sm text-neutral-400">
                      Resolved command access for Dokaflex after base role and overrides.
                    </p>
                  </div>
                  <div className="text-xs text-neutral-500">
                    Allowed: <span className="font-medium text-white">{preview?.allowedCommandKeys.length ?? 0}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {preview?.allowedCommandKeys.length ? (
                    preview.allowedCommandKeys.map((commandKey) => (
                      <span
                        key={commandKey}
                        className="inline-flex items-center rounded-full bg-green-500/10 px-3 py-1 text-xs font-medium text-green-300"
                      >
                        {commandKey}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-neutral-500">No Dokaflex commands currently allowed.</span>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-neutral-700 bg-neutral-900/40">
                <div className="border-b border-neutral-700 px-4 py-3">
                  <h3 className="text-sm font-semibold text-white">Policy Basis</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-neutral-700 text-left text-xs uppercase text-neutral-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">Command</th>
                        <th className="px-4 py-3 font-medium">Stage</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Basis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-neutral-500">
                            No Dokaflex commands available for preview.
                          </td>
                        </tr>
                      ) : (
                        previewRows.map((row) => (
                          <tr key={row.commandKey} className="border-b border-neutral-800 last:border-b-0">
                            <td className="px-4 py-3 font-mono text-xs text-blue-300">{row.commandKey}</td>
                            <td className="px-4 py-3 text-neutral-300">{row.stage}</td>
                            <td className="px-4 py-3">
                              <Badge tone={row.statusLabel === "Allowed" ? "success" : "error"}>
                                {row.statusLabel}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-neutral-300">
                              <div className="flex flex-wrap gap-2">
                                {row.reasonBadges.map((reasonBadge) => (
                                  <span
                                    key={`${row.commandKey}-${reasonBadge}`}
                                    className="inline-flex items-center rounded-full bg-neutral-700 px-2.5 py-1 text-xs text-neutral-200"
                                  >
                                    {reasonBadge}
                                  </span>
                                ))}
                              </div>
                              <div className="mt-2 text-xs text-neutral-500">{row.reasonSummary}</div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "success" | "error" | "neutral";
}) {
  const toneClassName =
    tone === "success"
      ? "bg-green-500/10 text-green-300"
      : tone === "error"
        ? "bg-red-500/10 text-red-300"
        : "bg-neutral-700 text-neutral-200";

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${toneClassName}`}>
      {children}
    </span>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-950/60 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
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
