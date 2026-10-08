export type Questions = string[]

declare module 'claude-code' {
  interface PluginState {
    'open-questions': { pending: Questions }
  }
}
