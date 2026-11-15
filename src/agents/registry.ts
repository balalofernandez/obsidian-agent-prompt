import { AgentRunner } from "./AgentRunner";
import { ClaudeCodeAgent } from "./ClaudeCodeAgent";
import { CodexAgent } from "./CodexAgent";
import { GeminiCliAgent } from "./GeminiCliAgent";
import { CursorAgent } from "./CursorAgent";
import { CopilotCliAgent } from "./CopilotCliAgent";
import { OpenCodeAgent } from "./OpenCodeAgent";
import { AmpAgent } from "./AmpAgent";
import { DroidAgent } from "./DroidAgent";
import { GrokAgent } from "./GrokAgent";
import { QwenCodeAgent } from "./QwenCodeAgent";
import { KimiAgent } from "./KimiAgent";
import { DeepSeekHarnessAgent } from "./DeepSeekHarnessAgent";
import { MistralVibeAgent } from "./MistralVibeAgent";
import { AiderAgent } from "./AiderAgent";
import { GooseAgent } from "./GooseAgent";
import { ClineAgent } from "./ClineAgent";
import { ContinueAgent } from "./ContinueAgent";
import { KiloCodeAgent } from "./KiloCodeAgent";
import { KiroAgent } from "./KiroAgent";
import { RovoDevAgent } from "./RovoDevAgent";
import { AntigravityAgent } from "./AntigravityAgent";
import { AuggieAgent } from "./AuggieAgent";
import { DevinAgent } from "./DevinAgent";
import { CodeBuddyAgent } from "./CodeBuddyAgent";
import { MimoCodeAgent } from "./MimoCodeAgent";
import { ZCodeAgent } from "./ZCodeAgent";
import { MuseCodeAgent } from "./MuseCodeAgent";
import { PiAgent } from "./PiAgent";
import { OhMyPiAgent } from "./OhMyPiAgent";
import { HermesAgent } from "./HermesAgent";
import { AutohandAgent } from "./AutohandAgent";
import { CommandCodeAgent } from "./CommandCodeAgent";
import { OpenClaudeAgent } from "./OpenClaudeAgent";

/**
 * All available agent runners, in the order shown in settings. Add new CLI agents here.
 * On first run the plugin picks the first one installed on the user's machine.
 */
export const AGENTS: AgentRunner[] = [
  new ClaudeCodeAgent(),
  new CodexAgent(),
  new GeminiCliAgent(),
  new CursorAgent(),
  new CopilotCliAgent(),
  new OpenCodeAgent(),
  new AmpAgent(),
  new DroidAgent(),
  new GrokAgent(),
  new QwenCodeAgent(),
  new KimiAgent(),
  new DeepSeekHarnessAgent(),
  new MistralVibeAgent(),
  new AiderAgent(),
  new GooseAgent(),
  new ClineAgent(),
  new ContinueAgent(),
  new KiloCodeAgent(),
  new KiroAgent(),
  new RovoDevAgent(),
  new AntigravityAgent(),
  new AuggieAgent(),
  new DevinAgent(),
  new CodeBuddyAgent(),
  new MimoCodeAgent(),
  new ZCodeAgent(),
  new MuseCodeAgent(),
  new PiAgent(),
  new OhMyPiAgent(),
  new HermesAgent(),
  new AutohandAgent(),
  new CommandCodeAgent(),
  new OpenClaudeAgent(),
];

export const DEFAULT_AGENT_ID = AGENTS[0].id;

export function getAgent(id: string): AgentRunner {
  return AGENTS.find((a) => a.id === id) ?? AGENTS[0];
}
