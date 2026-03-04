import request from 'supertest';
import { LinkPrecedence } from '@prisma/client';

type ContactRecord = {
  id: number;
  phoneNumber: string | null;
  email: string | null;
  linkedId: number | null;
  linkPrecedence: LinkPrecedence;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

const store = {
  contacts: [] as ContactRecord[],
  nextId: 1,
  clock: 0,
};

const now = (): Date => {
  store.clock += 1;
  return new Date(1700000000000 + store.clock);
};

const resetStore = (): void => {
  store.contacts = [];
  store.nextId = 1;
  store.clock = 0;
};

const prismaMock: any = {
  __reset: resetStore,
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  $queryRaw: jest.fn(async () => [{ ok: 1 }]),
  $transaction: jest.fn(async (cb: (tx: unknown) => unknown): Promise<unknown> => cb(prismaMock)),
  contact: {
    findUnique: jest.fn(async ({ where: { id } }: { where: { id: number } }) => {
      return store.contacts.find((c) => c.id === id) ?? null;
    }),
    findMany: jest.fn(
      async ({
        where,
        orderBy,
      }: {
        where?: {
          linkedId?: number;
          deletedAt?: null;
          OR?: Array<{ email?: string; phoneNumber?: string }>;
        };
        orderBy?: { createdAt: 'asc' | 'desc' };
      }) => {
        let result = [...store.contacts];

        if (where?.deletedAt === null) {
          result = result.filter((c) => c.deletedAt === null);
        }

        if (typeof where?.linkedId === 'number') {
          result = result.filter((c) => c.linkedId === where.linkedId);
        }

        if (where?.OR && where.OR.length > 0) {
          result = result.filter((c) =>
            where.OR!.some((clause) => {
              if (clause.email !== undefined) return c.email === clause.email;
              if (clause.phoneNumber !== undefined) {
                return c.phoneNumber === clause.phoneNumber;
              }
              return false;
            })
          );
        }

        if (orderBy?.createdAt) {
          result.sort((a, b) =>
            orderBy.createdAt === 'asc'
              ? a.createdAt.getTime() - b.createdAt.getTime()
              : b.createdAt.getTime() - a.createdAt.getTime()
          );
        }

        return result;
      }
    ),
    create: jest.fn(
      async ({
        data,
      }: {
        data: {
          phoneNumber?: string | null;
          email?: string | null;
          linkedId?: number | null;
          linkPrecedence: LinkPrecedence;
        };
      }) => {
        const createdAt = now();
        const contact: ContactRecord = {
          id: store.nextId++,
          phoneNumber: data.phoneNumber ?? null,
          email: data.email ?? null,
          linkedId: data.linkedId ?? null,
          linkPrecedence: data.linkPrecedence,
          createdAt,
          updatedAt: createdAt,
          deletedAt: null,
        };
        store.contacts.push(contact);
        return contact;
      }
    ),
    updateMany: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { linkedId?: number; deletedAt?: null };
        data: { linkedId?: number | null };
      }) => {
        let updated = 0;
        for (const c of store.contacts) {
          const linkedMatch =
            where.linkedId === undefined || c.linkedId === where.linkedId;
          const deletedMatch = where.deletedAt !== null || c.deletedAt === null;
          if (linkedMatch && deletedMatch) {
            if (data.linkedId !== undefined) c.linkedId = data.linkedId;
            c.updatedAt = now();
            updated += 1;
          }
        }
        return { count: updated };
      }
    ),
    update: jest.fn(
      async ({
        where: { id },
        data,
      }: {
        where: { id: number };
        data: {
          phoneNumber?: string | null;
          email?: string | null;
          linkedId?: number | null;
          linkPrecedence?: LinkPrecedence;
          updatedAt?: Date;
        };
      }) => {
        const existing = store.contacts.find((c) => c.id === id);
        if (!existing) {
          throw new Error(`Contact ${id} not found`);
        }

        if (data.phoneNumber !== undefined) existing.phoneNumber = data.phoneNumber;
        if (data.email !== undefined) existing.email = data.email;
        if (data.linkedId !== undefined) existing.linkedId = data.linkedId;
        if (data.linkPrecedence !== undefined) {
          existing.linkPrecedence = data.linkPrecedence;
        }
        existing.updatedAt = data.updatedAt ?? now();
        return existing;
      }
    ),
  },
};

jest.mock('../src/utils/prismaClient', () => ({
  __esModule: true,
  default: prismaMock,
}));

import app from '../src/app';

describe('POST /identify', () => {
  beforeEach(() => {
    prismaMock.__reset();
  });

  it('creates a new primary contact when none exists', async () => {
    const response = await request(app)
      .post('/identify')
      .send({ email: 'first@example.com', phoneNumber: '1111111111' })
      .expect(200);

    expect(response.body).toEqual({
      contact: {
        primaryContactId: 1,
        emails: ['first@example.com'],
        phoneNumbers: ['1111111111'],
        secondaryContactIds: [],
      },
    });
  });

  it('returns consolidated identity for existing contact', async () => {
    await request(app)
      .post('/identify')
      .send({ email: 'lookup@example.com', phoneNumber: '2222222222' })
      .expect(200);

    const response = await request(app)
      .post('/identify')
      .send({ email: 'lookup@example.com', phoneNumber: '2222222222' })
      .expect(200);

    expect(response.body.contact.primaryContactId).toBe(1);
    expect(response.body.contact.secondaryContactIds).toEqual([]);
  });

  it('creates a secondary when new phone/email appears for existing cluster', async () => {
    await request(app)
      .post('/identify')
      .send({ email: 'secondary@example.com', phoneNumber: '3333333333' })
      .expect(200);

    const response = await request(app)
      .post('/identify')
      .send({ email: 'secondary@example.com', phoneNumber: '4444444444' })
      .expect(200);

    expect(response.body.contact.primaryContactId).toBe(1);
    expect(response.body.contact.emails).toEqual(['secondary@example.com']);
    expect(response.body.contact.phoneNumbers).toEqual(['3333333333', '4444444444']);
    expect(response.body.contact.secondaryContactIds).toEqual([2]);
  });

  it('merges two primary contacts and keeps oldest as primary', async () => {
    await request(app)
      .post('/identify')
      .send({ email: 'old@example.com', phoneNumber: '5555555555' })
      .expect(200);

    await request(app)
      .post('/identify')
      .send({ email: 'new@example.com', phoneNumber: '6666666666' })
      .expect(200);

    const mergeResponse = await request(app)
      .post('/identify')
      .send({ email: 'new@example.com', phoneNumber: '5555555555' })
      .expect(200);

    expect(mergeResponse.body.contact.primaryContactId).toBe(1);
    expect(mergeResponse.body.contact.emails).toEqual(['old@example.com', 'new@example.com']);
    expect(mergeResponse.body.contact.phoneNumbers).toEqual(['5555555555', '6666666666']);
    expect(mergeResponse.body.contact.secondaryContactIds).toEqual([2]);
  });

  it('accepts email-only requests', async () => {
    const response = await request(app)
      .post('/identify')
      .send({ email: 'emailonly@example.com' })
      .expect(200);

    expect(response.body).toEqual({
      contact: {
        primaryContactId: 1,
        emails: ['emailonly@example.com'],
        phoneNumbers: [],
        secondaryContactIds: [],
      },
    });
  });

  it('accepts phone-only requests', async () => {
    const response = await request(app)
      .post('/identify')
      .send({ phoneNumber: '7777777777' })
      .expect(200);

    expect(response.body).toEqual({
      contact: {
        primaryContactId: 1,
        emails: [],
        phoneNumbers: ['7777777777'],
        secondaryContactIds: [],
      },
    });
  });
});
