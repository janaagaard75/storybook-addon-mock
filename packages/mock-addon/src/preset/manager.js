import { addons, types } from "@storybook/addons";
import { Panel } from "../Panel";
import { ADDON_ID, PANEL_ID } from "../utils/constants";

addons.register(ADDON_ID, () => {
  // Register the panel
  addons.add(PANEL_ID, {
    type: types.PANEL,
    title: "Mock Request",
    match: ({ viewMode }) => viewMode === "story",
    render: Panel,
    paramKey: "mockAddonConfigs",
  });
});
