import type { AgentDto, AgentsDto } from '../../../shared/types.ts';
import { AGENT_STATUS_LABEL } from '../../labels.ts';

export function agentLabel(agent: AgentDto): string {
  return `${agent.name ?? agent.kind ?? 'agent'} · ${agent.paneId} · ${AGENT_STATUS_LABEL[agent.status]}`;
}

interface AgentTargetPickerProps {
  agents: AgentsDto | undefined;
  value: string;
  onChange: (paneId: string) => void;
}

/** Agents in this worktree. Explains why the list is empty instead of showing an empty select. */
export function AgentTargetPicker({ agents, value, onChange }: AgentTargetPickerProps) {
  if (!agents) return <div className="hint">讀取 agent…</div>;
  if (agents.herdr === 'unavailable') {
    return <div className="hint warn">herdr 沒有在執行。Review 會留在草稿，herdr 啟動後就能送出。</div>;
  }
  if (agents.agents.length === 0) {
    return <div className="hint warn">這個 worktree 裡沒有 agent。在這裡開一個 agent 後就能送出。</div>;
  }
  return (
    <label className="field">
      <span>送給</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {agents.agents.map((agent) => (
          <option key={agent.paneId} value={agent.paneId}>
            {agentLabel(agent)}
          </option>
        ))}
      </select>
    </label>
  );
}
