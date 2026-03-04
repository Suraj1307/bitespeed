# Bitespeed Identity Reconciliation API

## Project Overview
This service solves the Bitespeed identity reconciliation problem. It accepts `email` and/or `phoneNumber` and returns a consolidated identity with a stable primary contact and linked secondary contacts.

## Tech Stack
- Node.js
- Express
- TypeScript
- Prisma ORM
- PostgreSQL
- Render (deployment)

## API Endpoints
- `GET /`
  - Returns service metadata and available routes.
- `GET /health`
  - Returns service status and database connectivity.
- `POST /identify`
  - Reconciles identities and returns consolidated contact data.

## Example Request/Response
### Request
`POST /identify`

```json
{
  "email": "test@example.com",
  "phoneNumber": "1234567890"
}
```

### Response
```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["test@example.com"],
    "phoneNumbers": ["1234567890"],
    "secondaryContactIds": []
  }
}
```

## Identity Reconciliation Logic
The algorithm handles four required scenarios:

1. No existing contact match:
- Creates a new `primary` contact.

2. Existing identity match:
- Returns the existing consolidated identity.

3. Existing identity with new email/phone:
- Creates a new `secondary` contact linked to the primary.

4. Two primaries become connected by a new request:
- Oldest primary stays primary.
- Newer primary is demoted to secondary and linked to the oldest primary.
- Existing secondaries are re-parented to the oldest primary.

Response rules:
- `primaryContactId` is the oldest primary in the cluster.
- `emails[0]` is the primary email (if present).
- `phoneNumbers[0]` is the primary phone (if present).
- `secondaryContactIds` contains all linked secondaries.

## Project Architecture
- Controller layer: validates request payload and returns API responses.
  - `src/controllers/identifyController.ts`
- Service layer: contains reconciliation algorithm and business rules.
  - `src/services/identityService.ts`
- Database layer: Prisma client + schema/migrations.
  - `src/utils/prismaClient.ts`
  - `prisma/schema.prisma`
  - `prisma/migrations/*`

The reconciliation algorithm runs inside a Prisma transaction to avoid race conditions during merges and secondary creation.

## Local Development
1. Install dependencies:
```bash
npm install
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Set your database URL in `.env`.

4. Run migrations:
```bash
npm run db:migrate:dev
```

5. Start server:
```bash
npm run dev
```

## Testing
Run integration tests (Jest + Supertest):
```bash
npm test
```

Covered cases:
- New primary creation
- Existing identity lookup
- Secondary creation
- Primary merge
- Email-only request
- Phone-only request

## Deployment (Render)
- Build command:
```bash
npm install && npm run db:generate && npm run build && npm run db:migrate
```
- Start command:
```bash
npm start
```

Important: keep `prisma/migrations` committed, because production uses `prisma migrate deploy`.

## Live Endpoint
- Base URL: `https://bitespeed-identity-syw5.onrender.com`
- Health: `https://bitespeed-identity-syw5.onrender.com/health`
- Identify: `https://bitespeed-identity-syw5.onrender.com/identify`
