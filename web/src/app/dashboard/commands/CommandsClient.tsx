import Link from "next/link";

import type { CommandStage } from "@prisma/client";

type CommandCatalogRow = {
  commandKey: string;
  title: string;
  stage: CommandStage;
  iconDataUri: string | null;
  totalUses: number;
  uniqueUsers: number;
  placements: string[];
};

export default function CommandsClient({
  rows,
  versions,
}: {
  rows: CommandCatalogRow[];
  versions: {
    capabilityCatalogVersion: number;
    ribbonLayoutVersion: number;
    configVersion: number;
  };
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-neutral-700 bg-neutral-800 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h2 className="text-xl font-semibold text-white">Dokaflex Command Catalog</h2>
            <p className="mt-2 text-sm text-neutral-400">
              This page is now aligned with the current Dokaflex model: command stage, metadata,
              icon presence, usage, and current ribbon placement. Layout authoring lives in the
              dedicated Dokaflex control page.
            </p>
          </div>
          <Link
            href="/dashboard/dokaflex"
            className="inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Open Dokaflex Control
          </Link>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <MetricCard label="Catalog Version" value={versions.capabilityCatalogVersion} />
          <MetricCard label="Layout Version" value={versions.ribbonLayoutVersion} />
          <MetricCard label="Config Version" value={versions.configVersion} />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-800 shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-900/70 text-xs uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-4 py-3 font-medium">Command</th>
              <th className="px-4 py-3 font-medium">Stage</th>
              <th className="px-4 py-3 font-medium">Usage</th>
              <th className="px-4 py-3 font-medium">Layout Placement</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-700">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-neutral-500">
                  No Dokaflex commands are registered yet. Bootstrap Dokaflex from the Dokaflex
                  control page first.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-900/60 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
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
