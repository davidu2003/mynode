import { agentManager, ExtendedAgent } from '../websocket/agent.js';

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function getAgent(vpsId: number): ExtendedAgent | null {
  return agentManager.getAgent(vpsId) || null;
}

export function requireAgent(vpsId: number): ExtendedAgent {
  const agent = getAgent(vpsId);
  if (!agent) {
    throw new AgentOfflineError(vpsId);
  }
  return agent;
}

export async function execCommand(vpsId: number, command: string, timeout?: number): Promise<ExecResult> {
  const agent = requireAgent(vpsId);
  return agent.exec(command, timeout || 60000);
}

export async function readFile(vpsId: number, path: string): Promise<string> {
  const agent = requireAgent(vpsId);
  return agent.readFile(path);
}

export async function writeFile(vpsId: number, path: string, content: string): Promise<void> {
  const agent = requireAgent(vpsId);
  return agent.writeFile(path, content);
}

export function isAgentOnline(vpsId: number): boolean {
  return getAgent(vpsId) !== null;
}

export class AgentOfflineError extends Error {
  public readonly vpsId: number;

  constructor(vpsId: number) {
    super('Agent不在线');
    this.name = 'AgentOfflineError';
    this.vpsId = vpsId;
  }
}
