import type {
  RibbonLayoutItemViewModel,
  RibbonLayoutViewModel,
} from "@/lib/plugin-data/analyticsService";

export default function DokaflexRibbonAnalyticsSection({
  viewModel,
}: {
  viewModel: RibbonLayoutViewModel;
}) {
  return (
    <section className="mb-8 space-y-6">
      <div className="rounded-xl border border-neutral-700 bg-neutral-800 p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-white">Dokaflex Ribbon Layout Foundation</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Server-authored ribbon layout, plugin-published capabilities and icons, and raw-event usage aggregates for local live testing.
        </p>
      </div>

      {viewModel.tabs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-700 bg-neutral-900/40 px-6 py-8 text-sm text-neutral-500">
          No Dokaflex ribbon layout has been configured yet. Publish the capability catalog, then author the server-side ribbon layout.
        </div>
      ) : (
        viewModel.tabs.map((tab) => (
          <div key={tab.tabKey} className="rounded-xl border border-neutral-700 bg-neutral-800 shadow-sm">
            <div className="border-b border-neutral-700 px-6 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-semibold text-white">{tab.title}</h3>
                <span className="rounded-full bg-neutral-700 px-3 py-1 text-xs text-neutral-300">
                  {tab.tabKey}
                </span>
              </div>
            </div>

            <div className="grid gap-6 p-6 xl:grid-cols-2">
              {tab.panels.map((panel) => (
                <div key={panel.panelKey} className="rounded-lg border border-neutral-700 bg-neutral-900/40">
                  <div className="border-b border-neutral-700 px-4 py-3">
                    <div className="text-sm font-semibold text-white">{panel.title}</div>
                    <div className="mt-1 text-xs text-neutral-500">{panel.panelKey}</div>
                  </div>

                  <div className="space-y-3 p-4">
                    {panel.items.length === 0 ? (
                      <div className="text-sm text-neutral-500">No ribbon items in this panel.</div>
                    ) : (
                      panel.items.map((item) => <RibbonItemCard key={item.itemKey} item={item} depth={0} />)
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

function RibbonItemCard({
  item,
  depth,
}: {
  item: RibbonLayoutItemViewModel;
  depth: number;
}) {
  return (
    <div style={{ marginLeft: `${depth * 16}px` }} className="rounded-lg border border-neutral-700 bg-neutral-800/70 p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-900">
          {item.iconDataUri ? (
            <img src={item.iconDataUri} alt="" className="h-7 w-7 object-contain" />
          ) : (
            <span className="text-xs text-neutral-500">No icon</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium text-white">{item.resolvedTitle}</div>
            <span className="rounded-full bg-neutral-700 px-2.5 py-1 text-xs text-neutral-300">
              {item.kind}
            </span>
            {item.size ? (
              <span className="rounded-full bg-neutral-700 px-2.5 py-1 text-xs text-neutral-300">
                {item.size}
              </span>
            ) : null}
          </div>

          <div className="mt-1 flex flex-wrap gap-3 text-xs text-neutral-500">
            <span>{item.itemKey}</span>
            {item.commandKey ? <span>Command: {item.commandKey}</span> : null}
          </div>

          {item.analytics ? (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <MetricPill label="Total uses" value={item.analytics.totalUses} />
              <MetricPill label="Unique users" value={item.analytics.uniqueUsers} />
              <MetricPill
                label="Last used"
                value={item.analytics.lastUsedAtUtc ? item.analytics.lastUsedAtUtc.toISOString() : "Never"}
              />
            </div>
          ) : null}
        </div>
      </div>

      {item.children.length > 0 ? (
        <div className="mt-3 space-y-3">
          {item.children.map((childItem) => (
            <RibbonItemCard key={childItem.itemKey} item={childItem} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="rounded-full bg-blue-500/10 px-3 py-1 text-blue-200">
      {label}: <span className="font-medium text-white">{value}</span>
    </span>
  );
}
