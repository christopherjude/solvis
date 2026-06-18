import { Handle, Position, type NodeProps } from 'reactflow';
import type { Category } from '@solvis/core';
import { CATEGORY_COLOR } from './theme';

export interface ResourceNodeData {
  title: string;
  shortType: string;
  category: Category;
  dimmed: boolean;
}

/** A compact resource card: title + short AWS type, accented by category color. */
export function ResourceNode({ data, selected }: NodeProps<ResourceNodeData>) {
  const color = CATEGORY_COLOR[data.category];
  return (
    <div
      className="resource-node"
      style={{
        borderLeft: `4px solid ${color}`,
        opacity: data.dimmed ? 0.25 : 1,
        outline: selected ? `2px solid ${color}` : 'none',
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="resource-node__title" title={data.title}>
        {data.title}
      </div>
      <div className="resource-node__type" style={{ color }}>
        {data.shortType}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
