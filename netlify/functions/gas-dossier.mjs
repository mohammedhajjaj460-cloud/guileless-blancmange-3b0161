import { handleGasRelay } from './gasRelayCore.mjs'

export const handler = async (event) => {
  return handleGasRelay(event, {
    defaultExecUrlEnv: 'GAS_DOSSIER_EXEC_URL',
    secretEnv: 'GAS_DOSSIER_SECRET',
  })
}
