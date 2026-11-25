import { redirect } from 'next/navigation';
import { tryServerApi } from './api-server';
import type { Me } from './types';

export async function getSession(): Promise<Me | null> {
  return tryServerApi<Me>('/auth/me');
}

export async function requireSession(): Promise<Me> {
  const me = await getSession();
  if (!me) redirect('/login');
  return me;
}

export function hasPermission(me: Me, permission: string): boolean {
  return me.permissions.includes(permission);
}

export function hasAnyPermission(me: Me, permissions: string[]): boolean {
  return permissions.some((permission) => me.permissions.includes(permission));
}

/** Returns the caller's default branch or undefined when they have none. */
export function defaultBranch(me: Me) {
  return me.branches[0];
}
