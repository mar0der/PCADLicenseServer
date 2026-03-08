import { BaseRole, CommandStage } from "@prisma/client";

export const DEFAULT_PLUGIN_SLUG = "dokaflex";
export const DISABLED_LEGACY_ACCESS_LEVEL = 0;

export function baseRoleFromAccessLevel(accessLevel?: number | null): BaseRole {
  switch (accessLevel) {
    case 3:
      return BaseRole.BOSS;
    case 2:
      return BaseRole.TESTER;
    default:
      return BaseRole.USER;
  }
}

export function accessLevelFromBaseRole(baseRole: BaseRole): number {
  switch (baseRole) {
    case BaseRole.BOSS:
      return 3;
    case BaseRole.TESTER:
      return 2;
    default:
      return 1;
  }
}

export function commandStageFromAccessLevel(accessLevel?: number | null): CommandStage {
  switch (accessLevel) {
    case DISABLED_LEGACY_ACCESS_LEVEL:
      return CommandStage.DISABLED;
    case 3:
      return CommandStage.DEVELOPMENT;
    case 2:
      return CommandStage.TESTING;
    default:
      return CommandStage.RELEASED;
  }
}

export function accessLevelFromCommandStage(stage: CommandStage): number {
  switch (stage) {
    case CommandStage.DEVELOPMENT:
      return 3;
    case CommandStage.TESTING:
      return 2;
    case CommandStage.DISABLED:
      return DISABLED_LEGACY_ACCESS_LEVEL;
    default:
      return 1;
  }
}
