/**
 * First-run server URL setup prompt
 *
 * Checks whether the user has configured a server URL (via env var or settings).
 * If not, and the terminal is interactive, prompts the user to choose between
 * the hosted service and a self-hosted server. Saves the choice to settings.json.
 */

import chalk from 'chalk'
import inquirer from 'inquirer'
import { configuration } from '@/configuration'
import { updateSettings } from '@/persistence'

const DEFAULT_SERVER_URL = 'https://api.cluster-fluster.com'
const DEFAULT_WEBAPP_URL = 'https://app.happy.engineering'

/**
 * Validate a URL string — must be http(s) and parseable.
 */
function isValidUrl(input: string): true | string {
  try {
    const url = new URL(input)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return 'URL must start with http:// or https://'
    }
    return true
  } catch {
    return 'Please enter a valid URL (e.g. https://my-server.example.com)'
  }
}

/**
 * Check if server URL needs first-run setup and prompt if necessary.
 *
 * Skipped when:
 * - HAPPY_SERVER_URL env var is set (explicit override)
 * - serverUrl is already saved in settings.json
 * - Not running in an interactive TTY (CI, daemon, piped)
 */
export async function ensureServerUrlConfigured(): Promise<void> {
  // Env var takes precedence — user knows what they're doing
  if (configuration.serverUrlFromEnv) return

  // Already configured in settings
  if (configuration.serverUrlSource === 'settings') return

  // Non-interactive — skip silently
  if (!process.stdin.isTTY) return

  // First-run: prompt the user
  console.log('')
  console.log(chalk.bold.cyan('Welcome to Happy CLI!'))
  console.log(chalk.gray('Let\'s configure your server connection.\n'))

  const { hosting } = await inquirer.prompt([{
    type: 'list',
    name: 'hosting',
    message: 'Which server do you want to connect to?',
    choices: [
      { name: 'Happy Cloud (hosted service)', value: 'hosted' },
      { name: 'Self-hosted server', value: 'self-hosted' },
    ],
  }])

  if (hosting === 'hosted') {
    // Save explicitly so we don't prompt again
    await updateSettings(settings => ({
      ...settings,
      serverUrl: DEFAULT_SERVER_URL,
      webappUrl: DEFAULT_WEBAPP_URL,
    }))
    configuration.serverUrl = DEFAULT_SERVER_URL
    configuration.webappUrl = DEFAULT_WEBAPP_URL
    console.log(chalk.green('\n✓ Using Happy Cloud'))
    console.log(chalk.gray(`  Server: ${DEFAULT_SERVER_URL}\n`))
    return
  }

  // Self-hosted flow
  const { serverUrl } = await inquirer.prompt([{
    type: 'input',
    name: 'serverUrl',
    message: 'Enter your server URL:',
    validate: isValidUrl,
  }])

  // Strip trailing slash for consistency
  const cleanServerUrl = serverUrl.replace(/\/+$/, '')

  const { webappUrl } = await inquirer.prompt([{
    type: 'input',
    name: 'webappUrl',
    message: 'Enter your webapp URL (or press Enter to skip):',
    default: DEFAULT_WEBAPP_URL,
    validate: (input: string) => {
      if (!input) return true
      return isValidUrl(input)
    },
  }])

  const cleanWebappUrl = (webappUrl || DEFAULT_WEBAPP_URL).replace(/\/+$/, '')

  await updateSettings(settings => ({
    ...settings,
    serverUrl: cleanServerUrl,
    webappUrl: cleanWebappUrl,
  }))

  configuration.serverUrl = cleanServerUrl
  configuration.webappUrl = cleanWebappUrl

  console.log(chalk.green('\n✓ Server configured'))
  console.log(chalk.gray(`  Server URL: ${cleanServerUrl}`))
  console.log(chalk.gray(`  Webapp URL: ${cleanWebappUrl}`))
  console.log(chalk.gray('  Run "happy setup" to change later.\n'))
}
