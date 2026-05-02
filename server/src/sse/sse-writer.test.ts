// @vitest-environment node

import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';

import { writeSseChunk } from './sse-writer';

class FakeRawResponse extends EventEmitter {
  writableEnded = false;
  destroyed = false;
  nextWriteResult = true;

  write(_payload: string): boolean {
    return this.nextWriteResult;
  }
}

describe('writeSseChunk', () => {
  it('returns false when the response already ended or was destroyed', async () => {
    const ended = new FakeRawResponse();
    ended.writableEnded = true;

    const destroyed = new FakeRawResponse();
    destroyed.destroyed = true;

    await expect(writeSseChunk('data: one\n\n', { raw: ended } as never)).resolves.toBe(false);
    await expect(writeSseChunk('data: two\n\n', { raw: destroyed } as never)).resolves.toBe(false);
  });

  it('waits for drain when the socket backpressures and stays writable', async () => {
    const raw = new FakeRawResponse();
    raw.nextWriteResult = false;

    const writePromise = writeSseChunk('data: slow\n\n', { raw } as never);
    queueMicrotask(() => {
      raw.emit('drain');
    });

    await expect(writePromise).resolves.toBe(true);
  });

  it('returns false when the socket closes before drain', async () => {
    const raw = new FakeRawResponse();
    raw.nextWriteResult = false;

    const writePromise = writeSseChunk('data: slow\n\n', { raw } as never);
    queueMicrotask(() => {
      raw.destroyed = true;
      raw.emit('close');
    });

    await expect(writePromise).resolves.toBe(false);
  });
});
