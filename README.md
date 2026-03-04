# Bitespeed Identity Reconciliation API

## Project Overview

This service solves the **Bitespeed Identity Reconciliation problem**.

The API accepts an `email` and/or `phoneNumber` and returns a **consolidated identity** containing:

* A stable **primary contact**
* All associated **secondary contacts**
* Aggregated **emails and phone numbers**

The service ensures that **the oldest contact remains the primary identity** while new related contacts are linked as secondaries.

---

# Tech Stack

* **Node.js**
* **Express.js**
* **TypeScript**
* **Prisma ORM**
* **PostgreSQL**
* **Render (Cloud Deployment)**
* **Jest + Supertest (Testing)**

---

# Live API

Base URL

```
https://bitespeed-identity-syw5.onrender.com
```

### Health Check

```
GET /health
```

Example:

```
https://bitespeed-identity-syw5.onrender.com/health
```

Response:

```json
{
  "status": "ok",
  "timestamp": "2026-03-04T22:02:54.828Z",
  "uptime": 448.34,
  "database": "connected"
}
```

---

# API Endpoints

## Root Endpoint

```
GET /
```

Returns API metadata and available routes.

---

## Health Endpoint

```
GET /health
```

Checks server and database status.

---

## Identity Reconciliation

```
POST /identify
```

Accepts an `email` and/or `phoneNumber` and returns the consolidated contact identity.

---

# Example Request

```
POST /identify
```

```json
{
  "email": "test@example.com",
  "phoneNumber": "1234567890"
}
```

---

# Example Response

```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": [
      "test@example.com"
    ],
    "phoneNumbers": [
      "1234567890"
    ],
    "secondaryContactIds": []
  }
}
```

---

# Identity Reconciliation Logic

The algorithm handles the four required scenarios defined in the assignment.

### 1. No Existing Contact

If no contact exists with the provided email or phone number:

* A new **primary contact** is created.

---

### 2. Existing Identity Found

If a matching contact already exists:

* The existing identity cluster is returned.

---

### 3. Partial Match (New Email or Phone)

If a request matches an existing identity but introduces new information:

Example

Existing contact

```
email: a@example.com
phone: 111
```

New request

```
email: b@example.com
phone: 111
```

Result:

* A **secondary contact** is created
* Linked to the existing primary

---

### 4. Two Primary Contacts Become Connected

Example:

```
A: email1 + phone1
B: email2 + phone2
C: email1 + phone2
```

Result:

* Oldest contact remains **primary**
* Newer primary becomes **secondary**
* All secondaries are re-linked to the oldest primary

---

# Response Rules

* `primaryContactId` → oldest primary contact
* `emails[0]` → primary email (if present)
* `phoneNumbers[0]` → primary phone number (if present)
* `secondaryContactIds` → all linked secondary contacts

---

# Project Architecture

The project follows a **layered architecture**.

### Controller Layer

Handles request validation and API responses.

```
src/controllers/identifyController.ts
```

---

### Service Layer

Contains the **identity reconciliation algorithm** and business logic.

```
src/services/identityService.ts
```

---

### Database Layer

Prisma ORM manages database interactions.

```
src/utils/prismaClient.ts
prisma/schema.prisma
prisma/migrations/*
```

All reconciliation operations run inside a **Prisma transaction** to avoid race conditions.

---

# Local Development

### Install dependencies

```bash
npm install
```

---

### Create environment file

```bash
cp .env.example .env
```

---

### Configure database

Set the database URL in `.env`.

```
DATABASE_URL=postgresql://user:password@localhost:5432/bitespeed
```

---

### Run migrations

```bash
npm run db:migrate:dev
```

---

### Start development server

```bash
npm run dev
```

Server runs on

```
http://localhost:3000
```

---

# Testing

Run integration tests:

```bash
npm test
```

Testing tools:

* **Jest**
* **Supertest**

Covered scenarios:

* New primary creation
* Existing identity lookup
* Secondary contact creation
* Primary merge
* Email-only requests
* Phone-only requests

---

# API Testing

### Postman / Thunder Client

Request:

```
POST https://bitespeed-identity-syw5.onrender.com/identify
```

Body:

```json
{
  "email": "alex@example.com",
  "phoneNumber": "5551112222"
}
```

---

### Curl Example

```bash
curl -X POST https://bitespeed-identity-syw5.onrender.com/identify \
-H "Content-Type: application/json" \
-d '{"email":"alex@example.com","phoneNumber":"5551112222"}'
```

---

# Deployment (Render)

Build Command

```bash
npm install && npm run build
```

Start Command

```bash
npx prisma migrate deploy && npm start
```

Important:

Production requires **Prisma migrations to be committed** because deployment runs:

```
prisma migrate deploy
```

---

# Live Endpoints

Base URL

```
https://bitespeed-identity-syw5.onrender.com
```

Health

```
https://bitespeed-identity-syw5.onrender.com/health
```

Identity Reconciliation

```
https://bitespeed-identity-syw5.onrender.com/identify
```

---

# Author

Suraj Kumar
