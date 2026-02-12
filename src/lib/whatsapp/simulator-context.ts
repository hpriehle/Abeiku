// Simulator mode — AsyncLocalStorage context that captures outbound messages
// instead of sending them to the Meta Graph API.

import { AsyncLocalStorage } from "node:async_hooks";

export interface SimulatorMessage {
  type: string;
  to: string;
  body: object;
}

export interface SimulatorContext {
  messages: SimulatorMessage[];
}

export const simulatorStorage = new AsyncLocalStorage<SimulatorContext>();

export function getSimulatorContext(): SimulatorContext | undefined {
  return simulatorStorage.getStore();
}

export function isSimulatorMode(): boolean {
  return !!simulatorStorage.getStore();
}
