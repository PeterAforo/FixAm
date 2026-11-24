"use server";

/**
 * Client-callable server actions for the shared workspace staff system.
 * Implementation lives in lib/staff/workspace.ts (server-only).
 */
import {
  acceptWorkspaceInvite,
  cancelWorkspaceInvite,
  inviteWorkspaceMember,
  removeWorkspaceMember,
  resendWorkspaceInvite,
  setWorkspaceMemberStatus,
  updateWorkspaceMemberRole,
} from "./workspace";
import type { WorkspaceKind } from "./workspace-shared";

export async function inviteWorkspaceMemberAction(rawInput: unknown) {
  return inviteWorkspaceMember(rawInput);
}

export async function resendWorkspaceInviteAction(rawInput: {
  kind: WorkspaceKind;
  inviteId: string;
}) {
  return resendWorkspaceInvite(rawInput);
}

export async function cancelWorkspaceInviteAction(rawInput: {
  kind: WorkspaceKind;
  inviteId: string;
}) {
  return cancelWorkspaceInvite(rawInput);
}

export async function updateWorkspaceMemberRoleAction(rawInput: unknown) {
  return updateWorkspaceMemberRole(rawInput);
}

export async function setWorkspaceMemberStatusAction(rawInput: unknown) {
  return setWorkspaceMemberStatus(rawInput);
}

export async function removeWorkspaceMemberAction(rawInput: unknown) {
  return removeWorkspaceMember(rawInput);
}

export async function acceptWorkspaceInviteAction(token: string) {
  return acceptWorkspaceInvite(token);
}
