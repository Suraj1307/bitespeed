# Bitespeed Identity Reconciliation

## Quick Start

```bash
# 1. Init project
mkdir bitespeed-identity && cd bitespeed-identity
# (place all files above into their paths)

# 2. Install
npm install

# 3. Copy env
cp .env.example .env
# Edit DATABASE_URL in .env

# 4. Create DB and migrate
psql -U postgres -c "CREATE DATABASE bitespeed;"
npm run db:migrate:dev

# 5. Run
npm run dev
```
