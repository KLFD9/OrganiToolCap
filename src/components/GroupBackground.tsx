import { memo } from "react";
import type { NodeProps } from "@xyflow/react";

export interface GroupBackgroundData extends Record<string, unknown> {
  department: string;
  width: number;
  height: number;
  color: string;
}

function GroupBackgroundImpl({ data }: NodeProps & { data: GroupBackgroundData }) {
  const { department, width, height, color } = data;

  return (
    <div
      className="pointer-events-none rounded-2xl border border-dashed"
      style={{ width, height, background: `${color}0d`, borderColor: `${color}40` }}
    >
      <div
        className="rounded-br-xl rounded-tl-2xl px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
        style={{ background: `${color}26`, color }}
      >
        {department}
      </div>
    </div>
  );
}

export const GroupBackground = memo(GroupBackgroundImpl);
