import { handleGasRelay } from './gasRelayCore.mjs'

export const handler = async (event) => {
  return handleGasRelay(event, {
    defaultExecUrlEnv: 'GAS_RELANCES_EXEC_URL',
    secretEnv: 'GAS_RELANCES_SECRET',
  })
}
