import { randomUUID as uuidNode } from 'node:crypto';

export const randomUUID = (): string => uuidNode();
