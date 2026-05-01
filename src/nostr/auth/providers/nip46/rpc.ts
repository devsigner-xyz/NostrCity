import type { Nip46Cipher } from './crypto';
import type { Nip46TransportEvent } from './transport';

export interface Nip46RpcRequest {
    id: string;
    method: string;
    params: string[];
}

export interface Nip46RpcResponse {
    id: string;
    result?: string;
    error?: string;
}

interface Nip46RpcTransport {
    sendRequest(input: { requestId: string; content: string }): Promise<Nip46TransportEvent>;
}

interface CreateNip46RpcClientInput {
    transport: Nip46RpcTransport;
    cipher: Nip46Cipher;
}

function parseJsonObject(payload: string): Record<string, unknown> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(payload);
    } catch {
        throw new Error('Invalid NIP-46 JSON payload');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Invalid NIP-46 JSON payload');
    }

    return parsed as Record<string, unknown>;
}

export function serializeNip46Request(request: Nip46RpcRequest): string {
    return JSON.stringify({
        id: request.id,
        method: request.method,
        params: request.params,
    });
}

export function parseNip46Request(payload: string): Nip46RpcRequest {
    const object = parseJsonObject(payload);
    const id = object.id;
    const method = object.method;
    const params = object.params;

    if (typeof id !== 'string' || id.length === 0) {
        throw new Error('NIP-46 request id is required');
    }

    if (typeof method !== 'string' || method.length === 0) {
        throw new Error('NIP-46 request method is required');
    }

    if (!Array.isArray(params) || params.some((item) => typeof item !== 'string')) {
        throw new Error('NIP-46 request params must be a string array');
    }

    return {
        id,
        method,
        params,
    };
}

export function serializeNip46Response(response: Nip46RpcResponse): string {
    return JSON.stringify({
        id: response.id,
        result: response.result,
        error: response.error,
    });
}

export function parseNip46Response(payload: string): Nip46RpcResponse {
    const object = parseJsonObject(payload);
    const id = object.id;

    if (typeof id !== 'string' || id.length === 0) {
        throw new Error('NIP-46 response id is required');
    }

    const result = typeof object.result === 'string' ? object.result : undefined;
    const error = typeof object.error === 'string' ? object.error : undefined;

    const response: Nip46RpcResponse = {
        id,
    };

    if (result !== undefined) {
        response.result = result;
    }
    if (error !== undefined) {
        response.error = error;
    }

    return response;
}

export function createNip46ResponseClassifier(
    decrypt: (ciphertext: string) => Promise<string> | string
): (event: Nip46TransportEvent) => Promise<string | undefined> {
    return async (event: Nip46TransportEvent): Promise<string | undefined> => {
        try {
            const plaintext = await decrypt(event.content);
            return parseNip46Response(plaintext).id;
        } catch {
            return undefined;
        }
    };
}

export function createNip46EventResponseClassifier(input: {
    decrypt: (ciphertext: string) => Promise<string> | string;
}): (event: Nip46TransportEvent) => Promise<string | undefined> {
    return createNip46ResponseClassifier((ciphertext) => input.decrypt(ciphertext));
}

export function createNip46RpcClient(input: CreateNip46RpcClientInput) {
    return {
        async call(request: Nip46RpcRequest): Promise<Nip46RpcResponse> {
            const encryptedRequest = await input.cipher.encrypt(serializeNip46Request(request));
            const responseEvent = await input.transport.sendRequest({
                requestId: request.id,
                content: encryptedRequest,
            });

            const responsePlaintext = await input.cipher.decrypt(responseEvent.content);
            const response = parseNip46Response(responsePlaintext);

            if (response.id !== request.id) {
                throw new Error('NIP-46 response id mismatch');
            }

            return response;
        },
    };
}
