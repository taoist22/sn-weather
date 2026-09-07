import {PluginManager} from 'sn-plugin-lib';

const pending = new Map<string, Promise<boolean>>();

async function ensurePermission(permission: string, description: string): Promise<boolean> {
  const existing = pending.get(permission);
  if (existing) return existing;

  const request = (async () => {
    try {
      if (Number(await PluginManager.hasPermission(permission)) > 0) return true;
      return Number(await PluginManager.requestPermission(permission, description)) > 0;
    } catch {
      return false;
    }
  })();

  pending.set(permission, request);
  try {
    return await request;
  } finally {
    pending.delete(permission);
  }
}

export function ensureFileReadPermission(): Promise<boolean> {
  return ensurePermission(
    'plugin.permission.FILE:READ',
    'Allow Weather to read the current note page size for safe placement.',
  );
}

export function ensureFileWritePermission(): Promise<boolean> {
  return ensurePermission(
    'plugin.permission.FILE:WRITE',
    'Allow Weather to insert the weather stamp into the current note.',
  );
}

export function ensureInternetPermission(): Promise<boolean> {
  return ensurePermission(
    'plugin.permission.INTERNET',
    'Allow Weather to search locations and retrieve current weather.',
  );
}
