import { Contact, LinkPrecedence, Prisma } from '@prisma/client';
import prisma from '../utils/prismaClient';

// --- Types --------------------------------------------------------------------

export interface IdentifyRequest {
  email?: string | null;
  phoneNumber?: string | null;
}

export interface IdentifyResponse {
  contact: {
    primaryContactId: number;
    emails: string[];
    phoneNumbers: string[];
    secondaryContactIds: number[];
  };
}

type TxClient = Prisma.TransactionClient;

// --- Helpers ------------------------------------------------------------------

/**
 * Fetch a primary contact + all its secondaries, ordered by createdAt.
 */
async function fetchCluster(tx: TxClient, primaryId: number): Promise<Contact[]> {
  const [primary, secondaries] = await Promise.all([
    tx.contact.findUnique({ where: { id: primaryId } }),
    tx.contact.findMany({
      where: { linkedId: primaryId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  if (!primary) return secondaries;
  return [primary, ...secondaries];
}

/**
 * Build the API response shape from a cluster.
 * Primary contact's email and phone always appear first.
 */
function buildResponse(primary: Contact, all: Contact[]): IdentifyResponse {
  const emails: string[] = [];
  const phoneNumbers: string[] = [];
  const secondaryContactIds: number[] = [];

  // Primary values first
  if (primary.email) emails.push(primary.email);
  if (primary.phoneNumber) phoneNumbers.push(primary.phoneNumber);

  for (const c of all) {
    if (c.id === primary.id) continue;

    secondaryContactIds.push(c.id);

    if (c.email && !emails.includes(c.email)) emails.push(c.email);
    if (c.phoneNumber && !phoneNumbers.includes(c.phoneNumber)) {
      phoneNumbers.push(c.phoneNumber);
    }
  }

  return {
    contact: {
      primaryContactId: primary.id,
      emails,
      phoneNumbers,
      secondaryContactIds,
    },
  };
}

/**
 * Walk up the chain to find the root primary for any contact.
 */
async function resolveRootPrimary(tx: TxClient, contact: Contact): Promise<Contact> {
  if (contact.linkPrecedence === LinkPrecedence.primary) return contact;

  const parent = await tx.contact.findUnique({
    where: { id: contact.linkedId! },
  });

  // Fallback: treat orphaned secondary as its own root
  if (!parent) return contact;

  return resolveRootPrimary(tx, parent);
}

// --- Main ---------------------------------------------------------------------

export async function identifyContact(
  req: IdentifyRequest
): Promise<IdentifyResponse> {
  const { email, phoneNumber } = req;

  return prisma.$transaction(async (tx) => {
    // Step 1: Find all contacts matching email OR phoneNumber
    const matchingContacts = await tx.contact.findMany({
      where: {
        deletedAt: null,
        OR: [
          ...(email ? [{ email }] : []),
          ...(phoneNumber ? [{ phoneNumber }] : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    // -- CASE 1: No matches -> brand new primary contact ----------------------
    if (matchingContacts.length === 0) {
      const newContact = await tx.contact.create({
        data: {
          email: email ?? null,
          phoneNumber: phoneNumber ?? null,
          linkPrecedence: LinkPrecedence.primary,
        },
      });
      return buildResponse(newContact, [newContact]);
    }

    // Step 2: Resolve every match to its root primary
    const rootPrimaries = await Promise.all(
      matchingContacts.map((c) => resolveRootPrimary(tx, c))
    );

    // De-duplicate and sort oldest -> newest
    const uniquePrimariesMap = new Map<number, Contact>();
    for (const p of rootPrimaries) uniquePrimariesMap.set(p.id, p);

    const uniquePrimaries = Array.from(uniquePrimariesMap.values()).sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );

    // -- CASE 4: Two separate clusters now connected -> merge -----------------
    if (uniquePrimaries.length > 1) {
      const [oldestPrimary, ...newerPrimaries] = uniquePrimaries;

      for (const newerPrimary of newerPrimaries) {
        // Re-parent all the newer primary's secondaries to the oldest primary
        await tx.contact.updateMany({
          where: { linkedId: newerPrimary.id, deletedAt: null },
          data: { linkedId: oldestPrimary.id },
        });

        // Demote the newer primary to secondary
        await tx.contact.update({
          where: { id: newerPrimary.id },
          data: {
            linkPrecedence: LinkPrecedence.secondary,
            linkedId: oldestPrimary.id,
            updatedAt: new Date(),
          },
        });
      }

      // Check if this request also brought in a genuinely new email/phone
      const cluster = await fetchCluster(tx, oldestPrimary.id);
      const allEmails = cluster
        .map((c) => c.email)
        .filter((value): value is string => Boolean(value));
      const allPhones = cluster
        .map((c) => c.phoneNumber)
        .filter((value): value is string => Boolean(value));

      const needsNewSecondary =
        (email && !allEmails.includes(email)) ||
        (phoneNumber && !allPhones.includes(phoneNumber));

      if (needsNewSecondary) {
        await tx.contact.create({
          data: {
            email: email ?? null,
            phoneNumber: phoneNumber ?? null,
            linkedId: oldestPrimary.id,
            linkPrecedence: LinkPrecedence.secondary,
          },
        });
      }

      const finalCluster = await fetchCluster(tx, oldestPrimary.id);
      const primaryContact = finalCluster.find((c) => c.id === oldestPrimary.id)!;
      return buildResponse(primaryContact, finalCluster);
    }

    // -- Single cluster from here ---------------------------------------------
    const primaryContact = uniquePrimaries[0];
    const cluster = await fetchCluster(tx, primaryContact.id);

    const allEmails = cluster
      .map((c) => c.email)
      .filter((value): value is string => Boolean(value));
    const allPhones = cluster
      .map((c) => c.phoneNumber)
      .filter((value): value is string => Boolean(value));

    const hasNewEmail = email && !allEmails.includes(email);
    const hasNewPhone = phoneNumber && !allPhones.includes(phoneNumber);

    // -- CASE 3: Known contact but new email or phone -> add secondary --------
    if (hasNewEmail || hasNewPhone) {
      await tx.contact.create({
        data: {
          email: email ?? null,
          phoneNumber: phoneNumber ?? null,
          linkedId: primaryContact.id,
          linkPrecedence: LinkPrecedence.secondary,
        },
      });

      const updatedCluster = await fetchCluster(tx, primaryContact.id);
      return buildResponse(primaryContact, updatedCluster);
    }

    // -- CASE 2: Everything already known -> return consolidated view ----------
    return buildResponse(primaryContact, cluster);
  });
}
