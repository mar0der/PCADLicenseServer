import { RibbonItemKind, type PrismaClient } from "@prisma/client";

import { DEFAULT_PLUGIN_SLUG } from "../access-control/compat";
import {
  getRibbonLayoutDocument,
  replaceRibbonLayout,
  type RibbonLayoutDocumentInput,
} from "./service";

export const DEFAULT_DOKAFLEX_RIBBON_LAYOUT: RibbonLayoutDocumentInput = {
  pluginSlug: DEFAULT_PLUGIN_SLUG,
  tabs: [
    {
      tabKey: "DF.TAB.MAIN",
      title: "Dokaflex",
      order: 1,
      panels: [
        {
          panelKey: "DF.PANEL.UTILITIES",
          title: "Utilities",
          order: 1,
          items: [
            createButtonItem("DF.ITEM.UPDATE_PLUGIN", 1, "DF.UPDATE_PLUGIN", "Update Plugin"),
            createButtonItem("DF.ITEM.COMMANDS_WINDOW", 2, "DF.COMMANDS_WINDOW", "Commands Window"),
          ],
        },
        {
          panelKey: "DF.PANEL.GENERATE",
          title: "Generate",
          order: 2,
          items: [
            createButtonItem("DF.ITEM.GENERATE_BEAM", 1, "DF.GENERATE_BEAM", "Generate Beam"),
            createButtonItem("DF.ITEM.PLACE_PRIMARY_BEAMS", 2, "DF.PLACE_PRIMARY_BEAMS", "Place Primary Beams"),
            createButtonItem("DF.ITEM.PLACE_SECONDARY_BEAMS", 3, "DF.PLACE_SECONDARY_BEAMS", "Place Secondary Beams"),
            createButtonItem("DF.ITEM.PLACE_DOUBLER_BEAMS", 4, "DF.PLACE_DOUBLER_BEAMS", "Place Doubler Beams"),
          ],
        },
        {
          panelKey: "DF.PANEL.ARRAYS",
          title: "Arrays",
          order: 3,
          items: [
            createButtonItem("DF.ITEM.ARRAY_PRIMARY", 1, "DF.ARRAY_PRIMARY", "Array Primary"),
            createButtonItem("DF.ITEM.ARRAY_SECONDARY", 2, "DF.ARRAY_SECONDARY", "Array Secondary"),
            createButtonItem("DF.ITEM.SMART_ARRAY", 3, "DF.SMART_ARRAY", "Smart Array"),
          ],
        },
        {
          panelKey: "DF.PANEL.MODIFY",
          title: "Modify",
          order: 4,
          items: [
            createButtonItem("DF.ITEM.MOVE_FULL_BEAM", 1, "DF.MOVE_FULL_BEAM", "Move Full Beam"),
            createButtonItem("DF.ITEM.DELETE_RELATED_BEAMS", 2, "DF.DELETE_RELATED_BEAMS", "Delete Related Beams"),
            createButtonItem("DF.ITEM.DELETE_SELECTED_BEAMS", 3, "DF.DELETE_SELECTED_BEAMS", "Delete Selected Beams"),
            createButtonItem("DF.ITEM.HIDE_UNHIDE_BEAMS", 4, "DF.HIDE_UNHIDE_BEAMS", "Hide Unhide Beams"),
          ],
        },
        {
          panelKey: "DF.PANEL.SETTINGS",
          title: "Settings",
          order: 5,
          items: [
            createButtonItem("DF.ITEM.USER_SETTINGS", 1, "DF.USER_SETTINGS", "User Settings"),
            createButtonItem("DF.ITEM.PARAMETER_EDITOR", 2, "DF.PARAMETER_EDITOR", "Parameter Editor"),
          ],
        },
      ],
    },
  ],
};

export async function seedDokaflexRibbonLayout(prisma: PrismaClient): Promise<{
  pluginSlug: string;
  created: boolean;
  existing: boolean;
  tabsPersisted: number;
  panelsPersisted: number;
  itemsPersisted: number;
}> {
  const existingLayout = await getRibbonLayoutDocument(prisma, { pluginSlug: DEFAULT_PLUGIN_SLUG });
  if (existingLayout.tabs.length > 0) {
    return {
      pluginSlug: DEFAULT_PLUGIN_SLUG,
      created: false,
      existing: true,
      tabsPersisted: existingLayout.tabs.length,
      panelsPersisted: existingLayout.tabs.reduce((count, tab) => count + tab.panels.length, 0),
      itemsPersisted: countLayoutItems(existingLayout.tabs),
    };
  }

  const result = await replaceRibbonLayout(prisma, DEFAULT_DOKAFLEX_RIBBON_LAYOUT);
  return {
    pluginSlug: DEFAULT_PLUGIN_SLUG,
    created: result.changed,
    existing: !result.changed,
    tabsPersisted: result.tabsPersisted,
    panelsPersisted: result.panelsPersisted,
    itemsPersisted: result.itemsPersisted,
  };
}

function createButtonItem(itemKey: string, order: number, commandKey: string, title: string) {
  return {
    itemKey,
    order,
    kind: RibbonItemKind.push_button,
    size: "LARGE",
    commandKey,
    iconCommandKey: commandKey,
    title,
  };
}

function countLayoutItems(
  tabs: Awaited<ReturnType<typeof getRibbonLayoutDocument>>["tabs"]
): number {
  return tabs.reduce(
    (tabCount, tab) =>
      tabCount +
      tab.panels.reduce(
        (panelCount, panel) => panelCount + countPanelItems(panel.items),
        0
      ),
    0
  );
}

function countPanelItems(
  items: Awaited<ReturnType<typeof getRibbonLayoutDocument>>["tabs"][number]["panels"][number]["items"]
): number {
  return items.reduce(
    (count, item) => count + 1 + countPanelItems(item.children ?? []),
    0
  );
}
