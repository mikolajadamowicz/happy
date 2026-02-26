/**
 * `happy setup` command
 *
 * Interactive reconfiguration of server/webapp URLs and a status subcommand
 * to show the current configuration with source labels.
 */

import chalk from 'chalk'
import inquirer from 'inquirer'
import { configuration } from '@/configuration'
import { updateSettings, readSettings } from '@/persistence'

const DEFAULT_SERVER_URL = 'https://api.cluster-fluster.com'
const DEFAULT_WEBAPP_URL = 'https://app.happy.engineering'

function sourceLabel(source: 'env' | 'settings' | 'default'): string {
  switch (source) {
    case 'env': return chalk.yellow('env var')
    case 'settings': return chalk.cyan('settings.json')
    case 'default': return chalk.gray('default')
  }
}

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

export async function handleSetupCommand(args: string[]): Promise<void> {
  const subcommand = args[0]

  if (subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
    showSetupHelp()
    return
  }

  if (subcommand === 'status') {
    await handleSetupStatus()
    return
  }

  if (subcommand && subcommand !== 'help') {
    console.error(chalk.red(`Unknown setup subcommand: ${subcommand}`))
    showSetupHelp()
    process.exit(1)
  }

  await handleSetupInteractive()
}

async function handleSetupStatus(): Promise<void> {
  console.log(chalk.bold('\nServer Configuration\n'))

  console.log(`  Server URL:  ${chalk.blue(configuration.serverUrl)}  (${sourceLabel(configuration.serverUrlSource)})`)
  console.log(`  Webapp URL:  ${chalk.blue(configuration.webappUrl)}  (${sourceLabel(configuration.webappUrlSource)})`)

  if (configuration.serverUrlFromEnv || configuration.webappUrlFromEnv) {
    console.log(chalk.gray('\n  Env vars override settings.json. Unset them to use saved settings.'))
  }

  console.log(chalk.gray(`\n  Settings file: ${configuration.settingsFile}`))
  console.log('')
}

async function handleSetupInteractive(): Promise<void> {
  console.log(chalk.bold('\nServer Configuration\n'))

  if (configuration.serverUrlFromEnv) {
    console.log(chalk.yellow('  Note: HAPPY_SERVER_URL env var is set and takes precedence.'))
    console.log(chalk.yellow('  Changes here will only take effect when the env var is unset.\n'))
  }

  const { hosting } = await inquirer.prompt([{
    type: 'list',
    name: 'hosting',
    message: 'Which server do you want to connect to?',
    default: configuration.serverUrl === DEFAULT_SERVER_URL ? 'hosted' : 'self-hosted',
    choices: [
      { name: 'Happy Cloud (hosted service)', value: 'hosted' },
      { name: 'Self-hosted server', value: 'self-hosted' },
    ],
  }])

  if (hosting === 'hosted') {
    await updateSettings(settings => ({
      ...settings,
      serverUrl: DEFAULT_SERVER_URL,
      webappUrl: DEFAULT_WEBAPP_URL,
    }))

    if (!configuration.serverUrlFromEnv) {
      configuration.serverUrl = DEFAULT_SERVER_URL
    }
    if (!configuration.webappUrlFromEnv) {
      configuration.webappUrl = DEFAULT_WEBAPP_URL
    }

    console.log(chalk.green('\n✓ Configured for Happy Cloud'))
    console.log(chalk.gray(`  Server: ${DEFAULT_SERVER_URL}\n`))
    return
  }

  // Self-hosted flow
  const { serverUrl } = await inquirer.prompt([{
    type: 'input',
    name: 'serverUrl',
    message: 'Enter your server URL:',
    default: configuration.serverUrl !== DEFAULT_SERVER_URL ? configuration.serverUrl : undefined,
    validate: isValidUrl,
  }])

  const cleanServerUrl = serverUrl.replace(/\/+$/, '')

  const { webappUrl } = await inquirer.prompt([{
    type: 'input',
    name: 'webappUrl',
    message: 'Enter your webapp URL (or press Enter for default):',
    default: configuration.webappUrl,
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

  if (!configuration.serverUrlFromEnv) {
    configuration.serverUrl = cleanServerUrl
  }
  if (!configuration.webappUrlFromEnv) {
    configuration.webappUrl = cleanWebappUrl
  }

  console.log(chalk.green('\n✓ Server configured'))
  console.log(chalk.gray(`  Server URL: ${cleanServerUrl}`))
  console.log(chalk.gray(`  Webapp URL: ${cleanWebappUrl}\n`))
}

function showSetupHelp(): void {
  console.log(`
${chalk.bold('happy setup')} - Server configuration

${chalk.bold('Usage:')}
  happy setup              Configure server URL interactively
  happy setup status       Show current configuration and sources
  happy setup help         Show this help message

${chalk.bold('Environment Variables:')}
  HAPPY_SERVER_URL         Override server URL (takes priority over settings)
  HAPPY_WEBAPP_URL         Override webapp URL (takes priority over settings)

${chalk.bold('Examples:')}
  happy setup              Interactive server configuration
  happy setup status       Check current server URL and where it comes from
`)
}
