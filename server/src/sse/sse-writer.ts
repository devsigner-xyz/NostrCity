import type { FastifyReply } from 'fastify';

const waitForDrainOrClose = async (reply: Pick<FastifyReply, 'raw'>): Promise<void> => {
  await new Promise<void>((resolve) => {
    const onDrain = () => {
      cleanup();
    };

    const onClose = () => {
      cleanup();
    };

    const onError = () => {
      cleanup();
    };

    const cleanup = () => {
      reply.raw.off('drain', onDrain);
      reply.raw.off('close', onClose);
      reply.raw.off('error', onError);
      resolve();
    };

    reply.raw.on('drain', onDrain);
    reply.raw.on('close', onClose);
    reply.raw.on('error', onError);
  });
};

export const writeSseChunk = async (
  payload: string,
  reply: Pick<FastifyReply, 'raw'>,
): Promise<boolean> => {
  if (reply.raw.writableEnded || reply.raw.destroyed) {
    return false;
  }

  const writable = reply.raw.write(payload);
  if (writable) {
    return true;
  }

  await waitForDrainOrClose(reply);
  return !reply.raw.writableEnded && !reply.raw.destroyed;
};
