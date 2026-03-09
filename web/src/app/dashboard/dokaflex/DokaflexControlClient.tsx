"use client";

import { useEffect, useMemo, useState } from "react";

import type { Command, CommandStage } from "@prisma/client";

import {
  addPushButtonToPanel,
  addRibbonPanel,
  buildLocalTestingStatusModel,
  buildRibbonCommandCatalogRows,
  countRibbonLayoutInventory,
  moveRibbonItemToPanel,
  moveRibbonItemWithinPanel,
  moveRibbonPanel,
  removeRibbonItem,
  removeRibbonPanel,
  renameRibbonPanel,
  renameRibbonTab,
  type RibbonCommandCatalogEntry,
} from "@/lib/dashboard/dokaflexAdmin";
import type {
  RibbonLayoutDocument,
  RibbonLayoutDocumentInput,
  RibbonLayoutItemDocument,
} from "@/lib/ribbon-layout/service";

type Feedback =
  | {
      tone: "success" | "error";
      message: string;
    }
  | null;

type VersionsState = RibbonLayoutDocument["versions"];

export default function DokaflexControlClient({
  initialLayout,
  initialCatalogEntries,
}: {
  initialLayout: RibbonLayoutDocument;
  initialCatalogEntries: RibbonCommandCatalogEntry[];
}) {
  const [layout, setLayout] = useState<RibbonLayoutDocumentInput>(() => toEditableLayout(initialLayout));
  const [versions, setVersions] = useState<VersionsState>(initialLayout.versions);
  const [catalogEntries, setCatalogEntries] = useState<RibbonCommandCatalogEntry[]>(
    initialCatalogEntries
  );
  const [savedLayoutSignature, setSavedLayoutSignature] = useState(() =>
    createLayoutSignature(toEditableLayout(initialLayout))
  );
  const [tabTitleDrafts, setTabTitleDrafts] = useState<Record<string, string>>(() =>
    buildTabTitleDrafts(toEditableLayout(initialLayout))
  );
  const [panelTitleDrafts, setPanelTitleDrafts] = useState<Record<string, string>>(() =>
    buildPanelTitleDrafts(toEditableLayout(initialLayout))
  );
  const [newPanelTitles, setNewPanelTitles] = useState<Record<string, string>>({});
  const [newItemCommands, setNewItemCommands] = useState<Record<string, string>>({});
  const [moveTargets, setMoveTargets] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [isSeedingLayout, setIsSeedingLayout] = useState(false);

  useEffect(() => {
    const nextLayout = toEditableLayout(initialLayout);
    setLayout(nextLayout);
    setVersions(initialLayout.versions);
    setCatalogEntries(initialCatalogEntries);
    setSavedLayoutSignature(createLayoutSignature(nextLayout));
    setTabTitleDrafts(buildTabTitleDrafts(nextLayout));
    setPanelTitleDrafts(buildPanelTitleDrafts(nextLayout));
    setFeedback(null);
  }, [initialCatalogEntries, initialLayout]);

  const inventory = useMemo(() => countRibbonLayoutInventory(layout), [layout]);
  const statusModel = useMemo(
    () =>
      buildLocalTestingStatusModel({
        commandCount: catalogEntries.length,
        tabCount: inventory.tabCount,
        panelCount: inventory.panelCount,
        itemCount: inventory.itemCount,
        capabilityCatalogVersion: versions.capabilityCatalogVersion,
        ribbonLayoutVersion: versions.ribbonLayoutVersion,
        configVersion: versions.configVersion,
      }),
    [catalogEntries.length, inventory, versions]
  );
  const catalogRows = useMemo(
    () =>
      buildRibbonCommandCatalogRows({
        commands: catalogEntries,
        layout,
      }),
    [catalogEntries, layout]
  );
  const catalogEntryByCommandKey = useMemo(
    () => new Map(catalogEntries.map((entry) => [entry.commandKey, entry])),
    [catalogEntries]
  );
  const hasUnsavedChanges = createLayoutSignature(layout) !== savedLayoutSignature;

  async function handleBootstrapDokaflex() {
    setIsBootstrapping(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/admin/bootstrap/dokaflex", {
        method: "POST",
      });

      if (!response.ok) {
        const errorMessage = await readErrorMessage(response, "Dokaflex bootstrap failed.");
        setFeedback({
          tone: "error",
          message: errorMessage,
        });
        return;
      }

      const payload = (await response.json()) as {
        createdCount: number;
        existingCount: number;
        layout?: {
          created: boolean;
        };
      };

      await refreshDokaflexState({
        successMessage: payload.layout?.created
          ? `Dokaflex bootstrap completed. Seeded ${payload.createdCount} command(s) and created the default server layout.`
          : `Dokaflex bootstrap completed. ${payload.createdCount} command(s) were created, ${payload.existingCount} already existed, and the current layout remained intact.`,
      });
    } catch (error) {
      console.error("Failed to bootstrap Dokaflex", error);
      setFeedback({
        tone: "error",
        message: "Dokaflex bootstrap failed. Check server logs and try again.",
      });
    } finally {
      setIsBootstrapping(false);
    }
  }

  async function handleEnsureDefaultLayout() {
    setIsSeedingLayout(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/admin/bootstrap/dokaflex-layout", {
        method: "POST",
      });

      if (!response.ok) {
        const errorMessage = await readErrorMessage(
          response,
          "Default Dokaflex layout seed failed."
        );
        setFeedback({
          tone: "error",
          message: errorMessage,
        });
        return;
      }

      const payload = (await response.json()) as {
        created: boolean;
        tabsPersisted: number;
        panelsPersisted: number;
        itemsPersisted: number;
      };

      await refreshDokaflexState({
        successMessage: payload.created
          ? `Default Dokaflex layout seeded with ${payload.tabsPersisted} tab(s), ${payload.panelsPersisted} panel(s), and ${payload.itemsPersisted} item(s).`
          : "Default Dokaflex layout was already present. No server-authored layout changes were made.",
      });
    } catch (error) {
      console.error("Failed to seed default Dokaflex layout", error);
      setFeedback({
        tone: "error",
        message: "Default Dokaflex layout seed failed. Check server logs and try again.",
      });
    } finally {
      setIsSeedingLayout(false);
    }
  }

  async function handleReloadServerLayout() {
    await refreshDokaflexState({
      successMessage: "Reloaded the current server-owned Dokaflex layout and catalog state.",
    });
  }

  async function handleSaveLayout() {
    setIsSaving(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/admin/ribbon-layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(layout),
      });

      if (!response.ok) {
        const errorMessage = await readErrorMessage(response, "Dokaflex ribbon layout save failed.");
        setFeedback({
          tone: "error",
          message: errorMessage,
        });
        return;
      }

      const payload = (await response.json()) as {
        layout: RibbonLayoutDocument;
      };
      const nextLayout = toEditableLayout(payload.layout);
      setLayout(nextLayout);
      setVersions(payload.layout.versions);
      setSavedLayoutSignature(createLayoutSignature(nextLayout));
      setTabTitleDrafts(buildTabTitleDrafts(nextLayout));
      setPanelTitleDrafts(buildPanelTitleDrafts(nextLayout));
      setFeedback({
        tone: "success",
        message: "Saved the server-owned Dokaflex layout. The next config refresh will use this structure.",
      });
    } catch (error) {
      console.error("Failed to save Dokaflex layout", error);
      setFeedback({
        tone: "error",
        message: "Dokaflex ribbon layout save failed. Check server logs and try again.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  function applyLayoutChange(
    nextLayoutResult:
      | { ok: true; value: RibbonLayoutDocumentInput }
      | { ok: false; error: string }
  ) {
    if (!nextLayoutResult.ok) {
      setFeedback({
        tone: "error",
        message: nextLayoutResult.error,
      });
      return;
    }

    setLayout(nextLayoutResult.value);
    setFeedback(null);
  }

  function commitTabTitle(tabKey: string) {
    applyLayoutChange(renameRibbonTab(layout, tabKey, tabTitleDrafts[tabKey] ?? ""));
    const currentTitle =
      (tabTitleDrafts[tabKey] ?? layout.tabs.find((tab) => tab.tabKey === tabKey)?.title ?? "").trim() ||
      layout.tabs.find((tab) => tab.tabKey === tabKey)?.title ||
      "";
    setTabTitleDrafts((currentDrafts) => ({
      ...currentDrafts,
      [tabKey]: currentTitle,
    }));
  }

  function commitPanelTitle(panelKey: string) {
    applyLayoutChange(renameRibbonPanel(layout, panelKey, panelTitleDrafts[panelKey] ?? ""));
    const currentTitle =
      (panelTitleDrafts[panelKey] ??
        findPanel(layout, panelKey)?.title ??
        "").trim() || findPanel(layout, panelKey)?.title || "";
    setPanelTitleDrafts((currentDrafts) => ({
      ...currentDrafts,
      [panelKey]: currentTitle,
    }));
  }

  function handleAddPanel(tabKey: string) {
    const panelTitle = newPanelTitles[tabKey] ?? "";
    const result = addRibbonPanel(layout, tabKey, panelTitle);
    if (!result.ok) {
      setFeedback({
        tone: "error",
        message: result.error,
      });
      return;
    }

    const addedPanel = result.value.tabs
      .find((tab) => tab.tabKey === tabKey)
      ?.panels.find((panel) => !findPanel(layout, panel.panelKey));
    setLayout(result.value);
    if (addedPanel) {
      setPanelTitleDrafts((currentDrafts) => ({
        ...currentDrafts,
        [addedPanel.panelKey]: addedPanel.title,
      }));
    }
    setNewPanelTitles((currentTitles) => ({
      ...currentTitles,
      [tabKey]: "",
    }));
    setFeedback({
      tone: "success",
      message: `Added panel ${panelTitle.trim()} to the Dokaflex layout draft.`,
    });
  }

  function handleAddPushButton(panelKey: string) {
    const commandKey = newItemCommands[panelKey] ?? "";
    const command = catalogEntryByCommandKey.get(commandKey);
    const result = addPushButtonToPanel(
      layout,
      panelKey,
      commandKey,
      command?.manifestTitle ?? command?.displayName ?? commandKey
    );

    if (!result.ok) {
      setFeedback({
        tone: "error",
        message: result.error,
      });
      return;
    }

    setLayout(result.value);
    setFeedback({
      tone: "success",
      message: `Added ${command?.manifestTitle ?? command?.displayName ?? commandKey} to the Dokaflex layout draft.`,
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-neutral-700 bg-neutral-800 p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  statusModel.readinessTone === "success"
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-amber-500/15 text-amber-300"
                }`}
              >
                {statusModel.readinessLabel}
              </span>
              <span className="inline-flex rounded-full bg-neutral-700 px-3 py-1 text-xs text-neutral-300">
                {statusModel.bootstrapLabel}
              </span>
            </div>
            <h2 className="mt-4 text-xl font-semibold text-white">Local Testing</h2>
            <p className="mt-2 max-w-3xl text-sm text-neutral-400">{statusModel.readinessMessage}</p>
            <div className="mt-4 rounded-xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
              Stable local runs should use a non-OneDrive runtime copy. See
              <span className="mx-1 font-mono text-xs text-sky-200">docs/LOCAL_LIVE_TESTING.md</span>
              and
              <span className="ml-1 font-mono text-xs text-sky-200">scripts/sync_local_runtime.ps1</span>
              for the current workspace-safe flow.
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleBootstrapDokaflex()}
              disabled={isBootstrapping}
              className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {isBootstrapping ? "Bootstrapping..." : "Bootstrap Dokaflex"}
            </button>
            <button
              type="button"
              onClick={() => void handleEnsureDefaultLayout()}
              disabled={isSeedingLayout}
              className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-600 bg-neutral-900 px-4 text-sm font-medium text-white transition-colors hover:border-neutral-500 disabled:opacity-50"
            >
              {isSeedingLayout ? "Checking..." : "Ensure Default Layout"}
            </button>
            <button
              type="button"
              onClick={() => void handleReloadServerLayout()}
              disabled={isReloading}
              className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-600 bg-neutral-900 px-4 text-sm font-medium text-white transition-colors hover:border-neutral-500 disabled:opacity-50"
            >
              {isReloading ? "Reloading..." : "Reload Server Layout"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-7">
          {statusModel.versionCards.map((card) => (
            <MetricCard key={card.label} label={card.label} value={card.value} />
          ))}
          {statusModel.inventoryCards.map((card) => (
            <MetricCard key={card.label} label={card.label} value={card.value} />
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-neutral-700 bg-neutral-900/60 p-4">
          <h3 className="text-sm font-semibold text-white">Current Server Layout Summary</h3>
          {layout.tabs.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-400">
              No Dokaflex ribbon layout is stored yet. Seed the default layout, then refine it here.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {layout.tabs.map((tab) => (
                <div key={tab.tabKey} className="rounded-lg border border-neutral-700 bg-neutral-800/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">{tab.title}</p>
                      <p className="font-mono text-xs text-neutral-500">{tab.tabKey}</p>
                    </div>
                    <span className="text-xs text-neutral-400">{tab.panels.length} panel(s)</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tab.panels.map((panel) => (
                      <span
                        key={panel.panelKey}
                        className="inline-flex rounded-full bg-neutral-700 px-3 py-1 text-xs text-neutral-200"
                      >
                        {panel.title}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {feedback ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.tone === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <section className="rounded-2xl border border-neutral-700 bg-neutral-800 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Ribbon Layout Editor</h2>
            <p className="mt-2 max-w-3xl text-sm text-neutral-400">
              Edit the server-owned Dokaflex ribbon structure. This draft is what the signed
              plugin config snapshot will deliver on the next refresh.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {hasUnsavedChanges ? (
              <span className="inline-flex rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-300">
                Unsaved draft changes
              </span>
            ) : (
              <span className="inline-flex rounded-full bg-neutral-700 px-3 py-1 text-xs font-semibold text-neutral-300">
                Draft matches server
              </span>
            )}
            <button
              type="button"
              onClick={() => void handleSaveLayout()}
              disabled={isSaving || !hasUnsavedChanges}
              className="inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Layout"}
            </button>
          </div>
        </div>

        {layout.tabs.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-neutral-700 bg-neutral-900/40 px-6 py-10 text-center">
            <p className="text-sm text-neutral-400">
              No Dokaflex ribbon tabs exist yet. Use the default layout seed, then come back here
              to refine panel names, order, and command placement.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {layout.tabs.map((tab) => (
              <article key={tab.tabKey} className="rounded-2xl border border-neutral-700 bg-neutral-900/40 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                      Ribbon Tab
                    </label>
                    <input
                      type="text"
                      value={tabTitleDrafts[tab.tabKey] ?? tab.title}
                      onChange={(event) =>
                        setTabTitleDrafts((currentDrafts) => ({
                          ...currentDrafts,
                          [tab.tabKey]: event.target.value,
                        }))
                      }
                      onBlur={() => commitTabTitle(tab.tabKey)}
                      className="mt-2 h-11 w-full rounded-md border border-neutral-600 bg-neutral-800 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="mt-2 font-mono text-xs text-neutral-500">{tab.tabKey}</p>
                  </div>
                  <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-800/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                      Add Panel
                    </p>
                    <div className="mt-3 flex gap-3">
                      <input
                        type="text"
                        value={newPanelTitles[tab.tabKey] ?? ""}
                        onChange={(event) =>
                          setNewPanelTitles((currentTitles) => ({
                            ...currentTitles,
                            [tab.tabKey]: event.target.value,
                          }))
                        }
                        placeholder="New panel title"
                        className="h-10 flex-1 rounded-md border border-neutral-600 bg-neutral-900 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddPanel(tab.tabKey)}
                        className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-600 bg-neutral-900 px-4 text-sm font-medium text-white transition-colors hover:border-neutral-500"
                      >
                        Add Panel
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 xl:grid-cols-2">
                  {tab.panels.map((panel, panelIndex) => (
                    <section key={panel.panelKey} className="rounded-2xl border border-neutral-700 bg-neutral-800 p-4">
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0 flex-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                              Panel Title
                            </label>
                            <input
                              type="text"
                              value={panelTitleDrafts[panel.panelKey] ?? panel.title}
                              onChange={(event) =>
                                setPanelTitleDrafts((currentDrafts) => ({
                                  ...currentDrafts,
                                  [panel.panelKey]: event.target.value,
                                }))
                              }
                              onBlur={() => commitPanelTitle(panel.panelKey)}
                              className="mt-2 h-10 w-full rounded-md border border-neutral-600 bg-neutral-900 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <p className="mt-2 font-mono text-xs text-neutral-500">{panel.panelKey}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                applyLayoutChange(moveRibbonPanel(layout, panel.panelKey, "up"))
                              }
                              disabled={panelIndex === 0}
                              className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-600 bg-neutral-900 px-3 text-sm font-medium text-white transition-colors hover:border-neutral-500 disabled:opacity-40"
                            >
                              Move Up
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                applyLayoutChange(moveRibbonPanel(layout, panel.panelKey, "down"))
                              }
                              disabled={panelIndex === tab.panels.length - 1}
                              className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-600 bg-neutral-900 px-3 text-sm font-medium text-white transition-colors hover:border-neutral-500 disabled:opacity-40"
                            >
                              Move Down
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                applyLayoutChange(removeRibbonPanel(layout, panel.panelKey))
                              }
                              className="inline-flex h-10 items-center justify-center rounded-md border border-red-500/40 bg-red-500/10 px-3 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/20"
                            >
                              Remove Panel
                            </button>
                          </div>
                        </div>

                        <div className="rounded-xl border border-neutral-700 bg-neutral-900/60 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            Add Command Button
                          </p>
                          <div className="mt-3 flex flex-col gap-3 md:flex-row">
                            <select
                              value={newItemCommands[panel.panelKey] ?? ""}
                              onChange={(event) =>
                                setNewItemCommands((currentSelections) => ({
                                  ...currentSelections,
                                  [panel.panelKey]: event.target.value,
                                }))
                              }
                              className="h-10 flex-1 rounded-md border border-neutral-600 bg-neutral-900 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">Select a Dokaflex command</option>
                              {catalogRows.map((row) => (
                                <option key={row.commandKey} value={row.commandKey}>
                                  {row.title} ({row.commandKey})
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleAddPushButton(panel.panelKey)}
                              className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-600 bg-neutral-900 px-4 text-sm font-medium text-white transition-colors hover:border-neutral-500"
                            >
                              Add Push Button
                            </button>
                          </div>
                        </div>

                        {panel.items.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-neutral-700 bg-neutral-900/40 px-4 py-6 text-center text-sm text-neutral-500">
                            This panel is empty. Add a command-bound push button to place it in the ribbon.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {panel.items.map((item, itemIndex) => {
                              const command = item.commandKey
                                ? catalogEntryByCommandKey.get(item.commandKey) ?? null
                                : null;
                              const otherPanels = tab.panels.filter(
                                (candidatePanel) => candidatePanel.panelKey !== panel.panelKey
                              );

                              return (
                                <RibbonItemCard
                                  key={item.itemKey}
                                  command={command}
                                  item={item}
                                  moveTarget={moveTargets[item.itemKey] ?? ""}
                                  moveTargetOptions={otherPanels.map((candidatePanel) => ({
                                    panelKey: candidatePanel.panelKey,
                                    title: candidatePanel.title,
                                  }))}
                                  onChangeMoveTarget={(nextTarget) =>
                                    setMoveTargets((currentTargets) => ({
                                      ...currentTargets,
                                      [item.itemKey]: nextTarget,
                                    }))
                                  }
                                  onMoveToPanel={() =>
                                    applyLayoutChange(
                                      moveRibbonItemToPanel(
                                        layout,
                                        panel.panelKey,
                                        item.itemKey,
                                        moveTargets[item.itemKey] ?? ""
                                      )
                                    )
                                  }
                                  onMoveUp={() =>
                                    applyLayoutChange(
                                      moveRibbonItemWithinPanel(
                                        layout,
                                        panel.panelKey,
                                        item.itemKey,
                                        "up"
                                      )
                                    )
                                  }
                                  onMoveDown={() =>
                                    applyLayoutChange(
                                      moveRibbonItemWithinPanel(
                                        layout,
                                        panel.panelKey,
                                        item.itemKey,
                                        "down"
                                      )
                                    )
                                  }
                                  onRemove={() =>
                                    applyLayoutChange(
                                      removeRibbonItem(layout, panel.panelKey, item.itemKey)
                                    )
                                  }
                                  disableMoveUp={itemIndex === 0}
                                  disableMoveDown={itemIndex === panel.items.length - 1}
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-700 bg-neutral-800 p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Dokaflex Catalog</h2>
            <p className="mt-2 max-w-3xl text-sm text-neutral-400">
              This view keeps the current Dokaflex model visible: command stage, icon state, usage,
              and whether each command is currently placed in the server-owned ribbon layout.
            </p>
          </div>
          <span className="inline-flex rounded-full bg-neutral-700 px-3 py-1 text-xs text-neutral-300">
            {catalogRows.length} command(s)
          </span>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-neutral-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-900/70 text-xs uppercase tracking-wide text-neutral-400">
              <tr>
                <th className="px-4 py-3 font-medium">Command</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 font-medium">Usage</th>
                <th className="px-4 py-3 font-medium">Layout Placement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-700 bg-neutral-800">
              {catalogRows.map((row) => (
                <tr key={row.commandKey} className="align-top">
                  <td className="px-4 py-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900">
                        {row.iconDataUri ? (
                          <img
                            src={row.iconDataUri}
                            alt={row.title}
                            className="h-10 w-10 object-contain"
                          />
                        ) : (
                          <span className="text-[10px] uppercase tracking-wide text-neutral-500">
                            No Icon
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-white">{row.title}</p>
                        <p className="font-mono text-xs text-neutral-500">{row.commandKey}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <StageBadge stage={row.stage} />
                  </td>
                  <td className="px-4 py-4 text-neutral-300">
                    <p>{row.totalUses} total use(s)</p>
                    <p className="text-xs text-neutral-500">{row.uniqueUsers} unique user(s)</p>
                  </td>
                  <td className="px-4 py-4 text-neutral-300">
                    {row.placements.length === 0 ? (
                      <span className="text-neutral-500">Not placed in the current ribbon layout</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {row.placements.map((placement) => (
                          <span
                            key={`${row.commandKey}-${placement}`}
                            className="inline-flex rounded-full bg-neutral-700 px-3 py-1 text-xs text-neutral-200"
                          >
                            {placement}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  async function refreshDokaflexState(input: { successMessage: string }) {
    setIsReloading(true);
    try {
      const [layoutResponse, commandsResponse] = await Promise.all([
        fetch(`/api/admin/ribbon-layout?pluginSlug=${encodeURIComponent(layout.pluginSlug)}`, {
          method: "GET",
          cache: "no-store",
        }),
        fetch(`/api/admin/commands?pluginSlug=${encodeURIComponent(layout.pluginSlug)}`, {
          method: "GET",
          cache: "no-store",
        }),
      ]);

      if (!layoutResponse.ok) {
        const errorMessage = await readErrorMessage(layoutResponse, "Failed to reload Dokaflex layout.");
        setFeedback({
          tone: "error",
          message: errorMessage,
        });
        return;
      }

      if (!commandsResponse.ok) {
        const errorMessage = await readErrorMessage(commandsResponse, "Failed to reload Dokaflex commands.");
        setFeedback({
          tone: "error",
          message: errorMessage,
        });
        return;
      }

      const nextLayoutResponse = (await layoutResponse.json()) as RibbonLayoutDocument;
      const nextLayout = toEditableLayout(nextLayoutResponse);
      const nextCommands = (await commandsResponse.json()) as Command[];
      const nextCatalogEntries = mapCommandsIntoCatalogEntries(nextCommands, catalogEntries);

      setLayout(nextLayout);
      setVersions(nextLayoutResponse.versions);
      setCatalogEntries(nextCatalogEntries);
      setSavedLayoutSignature(createLayoutSignature(nextLayout));
      setTabTitleDrafts(buildTabTitleDrafts(nextLayout));
      setPanelTitleDrafts(buildPanelTitleDrafts(nextLayout));
      setFeedback({
        tone: "success",
        message: input.successMessage,
      });
    } catch (error) {
      console.error("Failed to refresh Dokaflex dashboard state", error);
      setFeedback({
        tone: "error",
        message: "Failed to reload Dokaflex dashboard state. Check server logs and try again.",
      });
    } finally {
      setIsReloading(false);
    }
  }
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-900/60 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function RibbonItemCard({
  item,
  command,
  moveTarget,
  moveTargetOptions,
  onChangeMoveTarget,
  onMoveToPanel,
  onMoveUp,
  onMoveDown,
  onRemove,
  disableMoveUp,
  disableMoveDown,
}: {
  item: RibbonLayoutItemDocument;
  command: RibbonCommandCatalogEntry | null;
  moveTarget: string;
  moveTargetOptions: Array<{ panelKey: string; title: string }>;
  onChangeMoveTarget: (value: string) => void;
  onMoveToPanel: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  disableMoveUp: boolean;
  disableMoveDown: boolean;
}) {
  const supportsInlineEditing = item.kind === "push_button" && (item.children?.length ?? 0) === 0;

  return (
    <article className="rounded-xl border border-neutral-700 bg-neutral-900/70 p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800">
              {command?.iconDataUri ? (
                <img
                  src={command.iconDataUri}
                  alt={command.manifestTitle ?? command.displayName}
                  className="h-10 w-10 object-contain"
                />
              ) : (
                <span className="text-[10px] uppercase tracking-wide text-neutral-500">No Icon</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-white">
                  {item.title ?? command?.manifestTitle ?? command?.displayName ?? item.itemKey}
                </p>
                <span className="inline-flex rounded-full bg-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300">
                  {item.kind}
                </span>
                {command ? <StageBadge stage={command.stage} /> : null}
              </div>
              <p className="mt-1 font-mono text-xs text-neutral-500">{item.commandKey ?? item.itemKey}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-400">
                <span className="inline-flex rounded-full bg-neutral-800 px-2 py-1">
                  {command?.totalUses ?? 0} total use(s)
                </span>
                <span className="inline-flex rounded-full bg-neutral-800 px-2 py-1">
                  {command?.uniqueUsers ?? 0} unique user(s)
                </span>
                <span className="inline-flex rounded-full bg-neutral-800 px-2 py-1">
                  {item.size ?? "DEFAULT"} size
                </span>
              </div>
            </div>
          </div>
          {!supportsInlineEditing ? (
            <p className="mt-3 text-xs text-amber-300">
              This ribbon item kind is preserved, but the current editor only offers rich editing
              for command-bound push buttons.
            </p>
          ) : null}
        </div>

        <div className="w-full max-w-sm space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={!supportsInlineEditing || disableMoveUp}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-neutral-600 bg-neutral-900 px-3 text-sm font-medium text-white transition-colors hover:border-neutral-500 disabled:opacity-40"
            >
              Move Up
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={!supportsInlineEditing || disableMoveDown}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-neutral-600 bg-neutral-900 px-3 text-sm font-medium text-white transition-colors hover:border-neutral-500 disabled:opacity-40"
            >
              Move Down
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={!supportsInlineEditing}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-red-500/40 bg-red-500/10 px-3 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-40"
            >
              Remove
            </button>
          </div>
          <div className="flex gap-2">
            <select
              value={moveTarget}
              onChange={(event) => onChangeMoveTarget(event.target.value)}
              disabled={!supportsInlineEditing || moveTargetOptions.length === 0}
              className="h-10 flex-1 rounded-md border border-neutral-600 bg-neutral-900 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
            >
              <option value="">Move to another panel</option>
              {moveTargetOptions.map((option) => (
                <option key={option.panelKey} value={option.panelKey}>
                  {option.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onMoveToPanel}
              disabled={!supportsInlineEditing || !moveTarget}
              className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-600 bg-neutral-900 px-4 text-sm font-medium text-white transition-colors hover:border-neutral-500 disabled:opacity-40"
            >
              Move Panel
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function StageBadge({ stage }: { stage: CommandStage }) {
  const tone =
    stage === "RELEASED"
      ? "bg-emerald-500/15 text-emerald-300"
      : stage === "TESTING"
        ? "bg-amber-500/15 text-amber-300"
        : stage === "DEVELOPMENT"
          ? "bg-sky-500/15 text-sky-300"
          : "bg-red-500/15 text-red-300";

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {stage}
    </span>
  );
}

function toEditableLayout(layout: RibbonLayoutDocument): RibbonLayoutDocumentInput {
  return {
    pluginSlug: layout.pluginSlug,
    tabs: layout.tabs.map((tab) => ({
      tabKey: tab.tabKey,
      title: tab.title,
      order: tab.order,
      panels: tab.panels.map((panel) => ({
        panelKey: panel.panelKey,
        title: panel.title,
        order: panel.order,
        items: panel.items.map((item) => cloneRibbonItem(item)),
      })),
    })),
  };
}

function cloneRibbonItem(item: RibbonLayoutItemDocument): RibbonLayoutItemDocument {
  return {
    itemKey: item.itemKey,
    order: item.order,
    kind: item.kind,
    size: item.size ?? null,
    commandKey: item.commandKey ?? null,
    iconCommandKey: item.iconCommandKey ?? null,
    title: item.title ?? null,
    children: (item.children ?? []).map(cloneRibbonItem),
  };
}

function buildTabTitleDrafts(layout: RibbonLayoutDocumentInput): Record<string, string> {
  return Object.fromEntries(layout.tabs.map((tab) => [tab.tabKey, tab.title]));
}

function buildPanelTitleDrafts(layout: RibbonLayoutDocumentInput): Record<string, string> {
  return Object.fromEntries(
    layout.tabs.flatMap((tab) => tab.panels.map((panel) => [panel.panelKey, panel.title]))
  );
}

function createLayoutSignature(layout: RibbonLayoutDocumentInput): string {
  return JSON.stringify(layout);
}

function findPanel(
  layout: RibbonLayoutDocumentInput,
  panelKey: string
): RibbonLayoutDocumentInput["tabs"][number]["panels"][number] | undefined {
  for (const tab of layout.tabs) {
    const panel = tab.panels.find((candidatePanel) => candidatePanel.panelKey === panelKey);
    if (panel) {
      return panel;
    }
  }

  return undefined;
}

function mapCommandsIntoCatalogEntries(
  commands: Command[],
  currentEntries: RibbonCommandCatalogEntry[]
): RibbonCommandCatalogEntry[] {
  const currentEntryByCommandKey = new Map(
    currentEntries.map((entry) => [entry.commandKey, entry])
  );

  return commands.map((command) => {
    const currentEntry = currentEntryByCommandKey.get(command.commandKey);
    return {
      commandKey: command.commandKey,
      displayName: command.displayName,
      manifestTitle: command.manifestTitle,
      stage: command.stage,
      iconDataUri: currentEntry?.iconDataUri ?? null,
      totalUses: currentEntry?.totalUses ?? 0,
      uniqueUsers: currentEntry?.uniqueUsers ?? 0,
      lastUsedAtUtc: currentEntry?.lastUsedAtUtc ?? null,
    };
  });
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
