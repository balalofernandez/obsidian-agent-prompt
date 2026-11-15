import { AgentRunner } from "./AgentRunner";
import { ClaudeCodeAgent } from "./ClaudeCodeAgent";

/** All available agent runners. Add new CLI agents here. */
export const AGENTS: AgentRunner[] = [new ClaudeCodeAgent()];

export const DEFAULT_AGENT_ID = AGENTS[0].id;

export function getAgent(id: string): AgentRunner {
  return AGENTS.find((a) => a.id === id) ?? AGENTS[0];
}
