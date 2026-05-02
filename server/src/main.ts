import { buildApp } from './app';

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 3000;

export const resolvePort = (rawPort: string | undefined): number => {
  const portValue = rawPort?.trim() || `${DEFAULT_PORT}`;
  const port = Number(portValue);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `Invalid PORT value "${portValue}". Expected an integer between 1 and 65535.`,
    );
  }

  return port;
};

export const resolveHost = (rawHost: string | undefined): string => {
  return rawHost?.trim() || DEFAULT_HOST;
};

export const formatLocalDockerReadyMessage = (
  env: Partial<Pick<NodeJS.ProcessEnv, 'NOSTR_CITY_DOCKER_LOCAL'>>,
): string | undefined => {
  if (env.NOSTR_CITY_DOCKER_LOCAL !== 'true') return undefined;

  return [
    '',
    'Nostr City local is ready.',
    '',
    'Open Nostr City locally:',
    '  App:  http://127.0.0.1:3000/app/',
    '  Docs: http://127.0.0.1:3000/docs/',
    '',
    'Press Ctrl+C to stop. Run `docker compose down` to remove the container.',
    '',
  ].join('\n');
};

export const logLocalDockerReadyMessage = (
  env: Partial<Pick<NodeJS.ProcessEnv, 'NOSTR_CITY_DOCKER_LOCAL'>>,
  write: (message: string) => void = console.info,
): void => {
  const localDockerReadyMessage = formatLocalDockerReadyMessage(env);
  if (localDockerReadyMessage) write(localDockerReadyMessage);
};

export const start = async (): Promise<void> => {
  const port = resolvePort(process.env.PORT);
  const host = resolveHost(process.env.HOST);
  const app = buildApp();

  try {
    await app.listen({ host, port });
    logLocalDockerReadyMessage(process.env);
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
    await app.close();
  }
};

const isDirectExecution = (): boolean => {
  return require.main === module;
};

if (isDirectExecution()) {
  void start().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
