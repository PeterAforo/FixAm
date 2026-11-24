import { getWorkspaceStaff, WORKSPACE_KINDS, type WorkspaceKind } from "@/lib/staff/workspace";
import { WorkspaceStaffPanel } from "./workspace-staff-panel";

/** Shared Staff screen body for vendor / broker / tow workspaces. */
export async function WorkspaceStaffSection({ kind }: { kind: WorkspaceKind }) {
  const staff = await getWorkspaceStaff(kind);
  if (!staff) return null;
  const meta = WORKSPACE_KINDS[kind];
  return (
    <div className="mx-auto max-w-[860px] space-y-5 px-4 py-6 md:px-8 md:py-8">
      <div>
        <h1 className="font-display text-[30px] leading-tight font-bold tracking-[-0.03em]">
          Staff
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          People who can work in {staff.workspaceName}. Only the owner sees billing and payouts.
        </p>
      </div>
      <WorkspaceStaffPanel
        kind={kind}
        workspaceName={staff.workspaceName}
        canManage={staff.canManage}
        members={staff.members}
        invites={staff.invites}
        maxStaff={staff.maxStaff}
        staffCount={staff.staffCount}
      />
      <p className="text-muted-foreground text-xs">{meta.label} workspace</p>
    </div>
  );
}
