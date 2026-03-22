# satspay-api

The backend API powering the SatsPay protocol. Built with Node.js and Express, it sits between the frontend and the Stacks blockchain — handling authentication, transaction orchestration, claim management, FX rates, SMS notifications, and NGN offramp payouts.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
  - [Auth](#auth)
  - [Transfers](#transfers)
  - [Claims](#claims)
  - [FX Rates](#fx-rates)
  - [Offramp](#offramp)
  - [Business](#business)
  - [Webhooks](#webhooks)
- [Core Services](#core-services)
  - [Transfer Engine](#transfer-engine)
  - [Claim Manager](#claim-manager)
  - [FX Oracle](#fx-oracle)
  - [SMS Service](#sms-service)
  - [Offramp Connector](#offramp-connector)
  - [Hiro Webhook Listener](#hiro-webhook-listener)
- [Environment Variables](#environment-variables)
- [Running Locally](#running-locally)
- [Testing](#testing)
- [Deployment](#deployment)

---

## Overview

The API is responsible for everything that happens **off-chain** in the SatsPay flow:

1. Authenticating users via phone OTP
2. Orchestrating sBTC transfers (deciding escrow vs direct send)
3. Generating and managing claim links
4. Sending SMS notifications to recipients
5. Listening to onchain events via Hiro webhooks
6. Converting sBTC amounts to NGN for display
7. Initiating NGN bank payouts via Flutterwave/Paystack
8. Handling business payroll (CSV bulk sends)

The API does **not** hold private keys or custody funds. All sBTC movement happens on-chain via Clarity contracts. The API's role is coordination — not custody.

---

## Architecture

```
Frontend (Next.js)
       │
       │  REST API calls
       ▼
satspay-api (Express)
       │
       ├── Auth Service ──────────────► Termii (SMS OTP)
       │
       ├── Transfer Engine ───────────► Stacks blockchain (via Hiro API)
       │       │                            │
       │       └── reads registry ─────────┘
       │
       ├── Claim Manager ─────────────► PostgreSQL (claim records)
       │
       ├── FX Oracle ─────────────────► CoinGecko API
       │
       ├── SMS Service ───────────────► Termii / Africa's Talking
       │
       ├── Offramp Connector ─────────► Flutterwave / Paystack
       │
       └── Webhook Listener ◄──────────── Hiro API (onchain events)
                │
                └── triggers Claim Manager + SMS Service
```

---

## Project Structure

```
satspay-api/
├── src/
│   ├── index.ts                  # Entry point, Express app setup
│   ├── config/
│   │   ├── env.ts                # Environment variable validation (zod)
│   │   ├── database.ts           # Prisma client instance
│   │   └── stacks.ts             # Stacks network config, contract addresses
│   │
│   ├── routes/
│   │   ├── auth.routes.ts        # POST /auth/request-otp, /auth/verify-otp
│   │   ├── transfer.routes.ts    # POST /transfers/send
│   │   ├── claim.routes.ts       # GET /claims/:token, POST /claims/:token/claim
│   │   ├── fx.routes.ts          # GET /fx/rate
│   │   ├── offramp.routes.ts     # POST /offramp/initiate
│   │   ├── business.routes.ts    # POST /business/payroll
│   │   └── webhook.routes.ts     # POST /webhooks/hiro
│   │
│   ├── services/
│   │   ├── auth.service.ts       # OTP generation, verification, JWT issuance
│   │   ├── transfer.service.ts   # Registry lookup, escrow vs direct logic
│   │   ├── claim.service.ts      # UUID generation, claim token lifecycle
│   │   ├── fx.service.ts         # CoinGecko polling, NGN rate caching
│   │   ├── sms.service.ts        # Termii / Africa's Talking integration
│   │   ├── offramp.service.ts    # Flutterwave / Paystack payout
│   │   ├── stacks.service.ts     # Hiro API wrapper, contract reads/writes
│   │   └── webhook.service.ts    # Onchain event processing
│   │
│   ├── middleware/
│   │   ├── auth.middleware.ts    # JWT verification
│   │   ├── rateLimit.middleware.ts # Per-IP and per-phone rate limiting
│   │   └── validate.middleware.ts  # Zod request validation
│   │
│   ├── jobs/
│   │   ├── fx.job.ts             # Cron: refresh FX rate every 5 minutes
│   │   └── expiry.job.ts         # Cron: mark expired claims, alert senders
│   │
│   └── utils/
│       ├── phone.ts              # Phone normalization, hashing
│       ├── crypto.ts             # SHA-256 helper, UUID generation
│       └── logger.ts             # Winston logger config
│
├── prisma/
│   ├── schema.prisma             # Database schema
│   └── migrations/               # Auto-generated Prisma migrations
│
├── tests/
│   ├── auth.test.ts
│   ├── transfer.test.ts
│   ├── claim.test.ts
│   ├── fx.test.ts
│   └── offramp.test.ts
│
├── .env.example                  # All required environment variables
├── package.json
├── tsconfig.json
└── README.md
```

---

## Database Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id          String    @id @default(cuid())
  phone       String    @unique          // normalized: +2348012345678
  phoneHash   String    @unique          // SHA-256(phone), stored onchain
  stacksAddress String? @unique         // set after wallet connection
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  sentTransfers     Transfer[] @relation("Sender")
  receivedTransfers Transfer[] @relation("Recipient")
  businessAccount   BusinessAccount?

  @@map("users")
}

model Transfer {
  id            String    @id @default(cuid())
  claimId       String    @unique          // (buff 32) hex — matches onchain claim-id
  claimToken    String    @unique          // UUID in the SMS link
  
  senderId      String
  sender        User      @relation("Sender", fields: [senderId], references: [id])
  
  recipientPhone      String               // normalized phone of recipient
  recipientPhoneHash  String               // SHA-256(recipientPhone)
  recipientId         String?              // set if recipient is a registered user
  recipient           User?     @relation("Recipient", fields: [recipientId], references: [id])
  
  amountMicroSbtc     BigInt               // amount in micro-sBTC (satoshis)
  amountNgn           Decimal?             // NGN equivalent at time of send (display only)
  fxRateAtSend        Decimal?             // sBTC/NGN rate used for display
  
  status        TransferStatus @default(PENDING)
  txid          String?                    // Stacks transaction ID of the send
  claimTxid     String?                    // Stacks transaction ID of the claim
  
  expiryBlock   Int                        // Stacks block height at expiry
  expiresAt     DateTime                   // Wall clock estimate of expiry (display)
  
  claimedAt     DateTime?
  reclaimedAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  offrampPayout OfframpPayout?

  @@map("transfers")
}

enum TransferStatus {
  PENDING         // send tx submitted, awaiting confirmation
  CONFIRMED       // send tx confirmed onchain, SMS sent to recipient
  CLAIMED         // recipient claimed onchain
  RECLAIMED       // sender reclaimed after expiry
  EXPIRED         // past expiry, not yet reclaimed
  FAILED          // send tx failed
}

model OfframpPayout {
  id            String    @id @default(cuid())
  transferId    String    @unique
  transfer      Transfer  @relation(fields: [transferId], references: [id])
  
  provider      OfframpProvider            // FLUTTERWAVE or PAYSTACK
  bankCode      String                     // recipient's bank code
  accountNumber String                     // recipient's account number
  accountName   String                     // verified account name
  amountNgn     Decimal                    // NGN amount to disburse
  
  providerRef   String?                    // provider's transaction reference
  status        OfframpStatus @default(INITIATED)
  
  initiatedAt   DateTime  @default(now())
  completedAt   DateTime?

  @@map("offramp_payouts")
}

enum OfframpProvider {
  FLUTTERWAVE
  PAYSTACK
}

enum OfframpStatus {
  INITIATED
  PROCESSING
  COMPLETED
  FAILED
}

model BusinessAccount {
  id          String    @id @default(cuid())
  userId      String    @unique
  user        User      @relation(fields: [userId], references: [id])
  
  businessName  String
  rcNumber      String?                    // CAC registration number
  verified      Boolean   @default(false)
  
  payrolls      Payroll[]
  createdAt     DateTime  @default(now())

  @@map("business_accounts")
}

model Payroll {
  id              String    @id @default(cuid())
  businessId      String
  business        BusinessAccount @relation(fields: [businessId], references: [id])
  
  label           String                   // e.g. "March 2026 Salaries"
  totalAmountMicroSbtc BigInt
  recipientCount  Int
  status          PayrollStatus @default(DRAFT)
  
  transfers       Transfer[]               // all transfers in this payroll batch
  
  createdAt       DateTime  @default(now())
  processedAt     DateTime?

  @@map("payrolls")
}

enum PayrollStatus {
  DRAFT
  PROCESSING
  COMPLETED
  PARTIAL                                  // some transfers failed
}

model OtpRecord {
  id          String    @id @default(cuid())
  phone       String
  code        String                       // 6-digit OTP (hashed in DB)
  expiresAt   DateTime
  used        Boolean   @default(false)
  createdAt   DateTime  @default(now())

  @@map("otp_records")
}

model FxRateCache {
  id          String    @id @default(cuid())
  sbtcToNgn   Decimal                      // how many NGN per 1 sBTC
  sbtcToUsd   Decimal                      // how many USD per 1 sBTC
  fetchedAt   DateTime  @default(now())

  @@map("fx_rate_cache")
}
```

---

## API Endpoints

All endpoints are prefixed with `/api/v1`. All request and response bodies are JSON. All authenticated endpoints require `Authorization: Bearer <jwt>` header.

---

### Auth

#### `POST /auth/request-otp`

Sends a 6-digit OTP to the provided phone number via SMS.

**Request:**
```json
{
  "phone": "+2348012345678"
}
```

**Response `200`:**
```json
{
  "success": true,
  "message": "OTP sent",
  "expiresIn": 300
}
```

**Errors:**
| Status | Code | Reason |
|---|---|---|
| `400` | `INVALID_PHONE` | Phone number failed validation |
| `429` | `RATE_LIMITED` | More than 3 OTP requests per phone per 10 minutes |

**Notes:**
- Phone numbers are normalized to E.164 format before hashing and storage
- OTP codes are 6 digits, expire after 5 minutes
- Maximum 3 OTP attempts before a 10-minute lockout

---

#### `POST /auth/verify-otp`

Verifies the OTP and returns a JWT. Creates a user record if this is their first login.

**Request:**
```json
{
  "phone": "+2348012345678",
  "code": "482910"
}
```

**Response `200`:**
```json
{
  "success": true,
  "token": "eyJhbGc...",
  "user": {
    "id": "clx...",
    "phone": "+2348012345678",
    "stacksAddress": null,
    "isNewUser": true
  }
}
```

**Errors:**
| Status | Code | Reason |
|---|---|---|
| `400` | `INVALID_OTP` | OTP is wrong or expired |
| `400` | `OTP_USED` | OTP has already been used |
| `429` | `TOO_MANY_ATTEMPTS` | 5 failed attempts — phone locked for 30 minutes |

---

#### `POST /auth/connect-wallet`

Links a Stacks wallet address to the authenticated user's account. Called after the user connects Leather or Xverse in the frontend.

**Auth:** Required

**Request:**
```json
{
  "stacksAddress": "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRCBGD7R",
  "signature": "0x...",
  "message": "SatsPay wallet connection - nonce: abc123"
}
```

**Response `200`:**
```json
{
  "success": true,
  "user": {
    "id": "clx...",
    "phone": "+2348012345678",
    "stacksAddress": "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRCBGD7R"
  }
}
```

**Notes:**
- The backend verifies the signature against the message and address to confirm the user controls the wallet
- After wallet connection, the backend calls `satspay-registry::register` on-chain to link the phone hash to the wallet address

---

### Transfers

#### `POST /transfers/send`

Initiates a transfer to a phone number. The backend checks the registry, determines whether to use escrow or direct send, and returns the unsigned transaction for the frontend to sign and broadcast.

**Auth:** Required

**Request:**
```json
{
  "recipientPhone": "+2348099887766",
  "amountMicroSbtc": 100000,
  "note": "For groceries"
}
```

**Response `200`:**
```json
{
  "success": true,
  "transferId": "clx...",
  "claimToken": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "sendType": "escrow",
  "recipient": {
    "phone": "+2348099887766",
    "isRegistered": false,
    "stacksAddress": null
  },
  "amounts": {
    "microSbtc": 100000,
    "sbtc": "0.001",
    "ngn": "9240.50",
    "fxRate": "9240500"
  },
  "unsignedTx": {
    "contractAddress": "ST...",
    "contractName": "satspay-escrow",
    "functionName": "send-to-phone",
    "functionArgs": ["0x...", "0x000186a0", "0x...", "0x000010e0"]
  }
}
```

**When `sendType` is `"direct"`** (recipient is registered):
```json
{
  "sendType": "direct",
  "recipient": {
    "isRegistered": true,
    "stacksAddress": "ST2PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRCBGD7R"
  },
  "unsignedTx": {
    "contractName": "satspay-sbtc-interface",
    "functionName": "transfer",
    "functionArgs": [...]
  }
}
```

**Errors:**
| Status | Code | Reason |
|---|---|---|
| `400` | `INVALID_PHONE` | Recipient phone number invalid |
| `400` | `INVALID_AMOUNT` | Amount is zero or below dust threshold |
| `400` | `SAME_PHONE` | Sender and recipient phone are the same |
| `402` | `INSUFFICIENT_BALANCE` | Sender's sBTC balance is too low (pre-checked) |

---

#### `POST /transfers/:transferId/confirm`

Called by the frontend after the wallet has signed and broadcast the transaction. Stores the txid and starts monitoring for confirmation.

**Auth:** Required

**Request:**
```json
{
  "txid": "0x3d2f..."
}
```

**Response `200`:**
```json
{
  "success": true,
  "status": "PENDING",
  "estimatedConfirmationMinutes": 10
}
```

---

#### `GET /transfers`

Returns the authenticated user's transfer history (sent and received).

**Auth:** Required

**Query params:**
| Param | Type | Default | Description |
|---|---|---|---|
| `page` | int | 1 | Page number |
| `limit` | int | 20 | Results per page (max 50) |
| `direction` | string | `all` | `sent`, `received`, or `all` |
| `status` | string | all | Filter by `PENDING`, `CONFIRMED`, `CLAIMED`, etc. |

**Response `200`:**
```json
{
  "transfers": [
    {
      "id": "clx...",
      "direction": "sent",
      "recipientPhone": "+2348099887766",
      "amountMicroSbtc": 100000,
      "amountSbtc": "0.001",
      "amountNgn": "9240.50",
      "status": "CONFIRMED",
      "createdAt": "2026-03-22T10:00:00Z",
      "expiresAt": "2026-04-21T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "pages": 3
  }
}
```

---

#### `GET /transfers/:transferId`

Returns full details of a single transfer.

**Auth:** Required (must be sender or recipient)

---

### Claims

#### `GET /claims/:claimToken`

Public endpoint — no auth required. Called when the recipient opens their claim link. Returns transfer details so the claim page can display what's waiting for them.

**Response `200`:**
```json
{
  "valid": true,
  "transfer": {
    "claimToken": "f47ac10b-...",
    "senderPhone": "+234801****678",
    "amountMicroSbtc": 100000,
    "amountSbtc": "0.001",
    "amountNgn": "9240.50",
    "status": "CONFIRMED",
    "expiresAt": "2026-04-21T10:00:00Z",
    "isExpired": false
  }
}
```

**Response `200` (expired or already claimed):**
```json
{
  "valid": false,
  "reason": "ALREADY_CLAIMED",
  "claimedAt": "2026-03-23T14:30:00Z"
}
```

**Possible `reason` values:**
| Reason | Meaning |
|---|---|
| `ALREADY_CLAIMED` | Recipient already claimed this transfer |
| `EXPIRED` | Transfer has passed its 30-day expiry |
| `RECLAIMED` | Sender reclaimed after expiry |
| `NOT_FOUND` | Invalid claim token |

---

#### `POST /claims/:claimToken/claim-to-wallet`

Recipient claims sBTC to their Stacks wallet. Returns an unsigned transaction for the recipient to sign.

**Request:**
```json
{
  "recipientAddress": "ST2PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRCBGD7R"
}
```

**Response `200`:**
```json
{
  "success": true,
  "unsignedTx": {
    "contractAddress": "ST...",
    "contractName": "satspay-escrow",
    "functionName": "claim",
    "functionArgs": ["0x...", "ST2PQHQKV0..."]
  }
}
```

---

#### `POST /claims/:claimToken/confirm-claim`

Called after the recipient has signed and broadcast the claim transaction.

**Request:**
```json
{
  "txid": "0x9f3a...",
  "recipientAddress": "ST2PQHQKV0..."
}
```

**Response `200`:**
```json
{
  "success": true,
  "status": "CLAIMED",
  "message": "Your sBTC is on its way. Confirmation in ~10 minutes."
}
```

---

#### `POST /claims/:claimToken/claim-to-bank`

Recipient claims by providing their NGN bank account. SatsPay handles the sBTC → NGN conversion and bank transfer. (v2 feature)

**Request:**
```json
{
  "bankCode": "057",
  "accountNumber": "3012345678",
  "provider": "flutterwave"
}
```

**Response `200`:**
```json
{
  "success": true,
  "accountName": "ADEBAYO MICHAEL",
  "amountNgn": "9240.50",
  "estimatedArrival": "2026-03-22T11:30:00Z",
  "payoutId": "clx..."
}
```

---

### FX Rates

#### `GET /fx/rate`

Returns the current sBTC exchange rates. Cached and refreshed every 5 minutes.

**Response `200`:**
```json
{
  "sbtcToNgn": "9240500.00",
  "sbtcToUsd": "87430.00",
  "ngnToUsd": "0.000009",
  "lastUpdated": "2026-03-22T10:55:00Z",
  "source": "coingecko"
}
```

---

#### `GET /fx/convert`

Converts a micro-sBTC amount to NGN and USD for display.

**Query params:** `amount=100000` (micro-sBTC)

**Response `200`:**
```json
{
  "microSbtc": 100000,
  "sbtc": "0.001",
  "ngn": "9,240.50",
  "usd": "87.43",
  "rate": {
    "sbtcToNgn": "9240500.00",
    "lastUpdated": "2026-03-22T10:55:00Z"
  }
}
```

---

### Offramp

#### `GET /offramp/banks`

Returns the list of supported Nigerian banks with their codes for the bank selection dropdown.

**Response `200`:**
```json
{
  "banks": [
    { "code": "044", "name": "Access Bank" },
    { "code": "057", "name": "Zenith Bank" },
    { "code": "058", "name": "GTBank" },
    { "code": "033", "name": "UBA" },
    { "code": "999999", "name": "Opay" },
    { "code": "50515", "name": "Moniepoint" }
  ]
}
```

---

#### `POST /offramp/verify-account`

Verifies a bank account number and returns the account holder's name before initiating payout.

**Request:**
```json
{
  "bankCode": "057",
  "accountNumber": "3012345678",
  "provider": "flutterwave"
}
```

**Response `200`:**
```json
{
  "valid": true,
  "accountName": "ADEBAYO MICHAEL OLUWASEUN",
  "bankCode": "057",
  "bankName": "Zenith Bank"
}
```

---

### Business

#### `POST /business/register`

Registers a business account for the authenticated user.

**Auth:** Required

**Request:**
```json
{
  "businessName": "TechStaff Nigeria Ltd",
  "rcNumber": "RC1234567"
}
```

---

#### `POST /business/payroll`

Accepts a JSON array of recipients and amounts. Creates a payroll batch and initiates individual transfers.

**Auth:** Required (must have business account)

**Request:**
```json
{
  "label": "March 2026 Salaries",
  "recipients": [
    { "phone": "+2348012345678", "amountMicroSbtc": 500000, "name": "Emeka Okafor" },
    { "phone": "+2348023456789", "amountMicroSbtc": 750000, "name": "Ngozi Adeyemi" },
    { "phone": "+2348034567890", "amountMicroSbtc": 600000, "name": "Tunde Bello" }
  ]
}
```

**Response `200`:**
```json
{
  "payrollId": "clx...",
  "label": "March 2026 Salaries",
  "totalAmountMicroSbtc": 1850000,
  "totalAmountSbtc": "0.0185",
  "totalAmountNgn": "170,948.25",
  "recipientCount": 3,
  "status": "PROCESSING",
  "transfers": [
    {
      "phone": "+2348012345678",
      "name": "Emeka Okafor",
      "claimToken": "f47ac10b-...",
      "status": "PENDING"
    }
  ]
}
```

---

#### `POST /business/payroll/upload-csv`

Accepts a CSV file upload. Parses it and returns a preview before committing.

**Content-Type:** `multipart/form-data`

**CSV format:**
```csv
phone,amount_sbtc,name
+2348012345678,0.005,Emeka Okafor
+2348023456789,0.0075,Ngozi Adeyemi
```

**Response `200`:**
```json
{
  "preview": [...],
  "totalAmountMicroSbtc": 1250000,
  "recipientCount": 2,
  "errors": []
}
```

---

### Webhooks

#### `POST /webhooks/hiro`

Receives onchain event notifications from Hiro API. This is how the backend knows when a transfer has been confirmed, claimed, or reclaimed without polling.

**Auth:** Verified via `x-hiro-signature` header (HMAC-SHA256)

**Payload (transfer-initiated event):**
```json
{
  "event": "print",
  "contractId": "ST....satspay-escrow",
  "txid": "0x3d2f...",
  "printValue": {
    "type": "transfer-initiated",
    "claimId": "0x...",
    "phoneHash": "0x...",
    "amount": 100000,
    "sender": "ST...",
    "expiryBlock": 164320
  }
}
```

**What the webhook handler does:**

| Event | Action |
|---|---|
| `transfer-initiated` | Updates transfer status to `CONFIRMED`, sends SMS to recipient |
| `transfer-claimed` | Updates transfer status to `CLAIMED`, triggers registry registration |
| `transfer-reclaimed` | Updates transfer status to `RECLAIMED`, notifies sender |

---

## Core Services

### Transfer Engine

`src/services/transfer.service.ts`

The transfer engine is the decision-maker for every send. Before building a transaction, it:

1. **Normalizes** the recipient's phone number
2. **Hashes** it with SHA-256
3. **Queries the registry contract** (`satspay-registry::get-address-for-phone`)
4. **Decides the flow:**
   - If registered → builds a direct sBTC transfer (no escrow, instant)
   - If not registered → builds an escrow `send-to-phone` call
5. **Generates a `claim-id`** (32-byte buffer, stored both in DB and onchain)
6. **Returns the unsigned transaction** to the frontend for signing

```typescript
async function buildSendTransaction(params: {
  senderAddress: string;
  recipientPhone: string;
  amountMicroSbtc: bigint;
}): Promise<SendTransactionResult> {
  const normalized = normalizePhone(params.recipientPhone);
  const phoneHash = hashPhone(normalized);

  const registryResult = await stacksService.callReadOnly(
    'satspay-registry',
    'get-address-for-phone',
    [bufferCV(phoneHash)]
  );

  if (registryResult.type === ClarityType.OptionalSome) {
    // Direct send
    const recipientAddress = registryResult.value.data.owner;
    return buildDirectTransfer(params.senderAddress, recipientAddress, params.amountMicroSbtc);
  } else {
    // Escrow send
    const claimId = generateClaimId();
    const claimToken = crypto.randomUUID();
    return buildEscrowSend(params.senderAddress, phoneHash, params.amountMicroSbtc, claimId, claimToken);
  }
}
```

---

### Claim Manager

`src/services/claim.service.ts`

Manages the lifecycle of claim tokens — the UUIDs that go into the SMS link.

**Claim token lifecycle:**
```
GENERATED → sent in SMS → OPENED (recipient views) → CLAIMED or EXPIRED
```

Key responsibilities:
- Generate secure UUID claim tokens and store against the transfer record
- Validate claim tokens on the claim page (not expired, not already claimed)
- Mark transfers as claimed when confirmed onchain
- Run the expiry cron job (checks for transfers past their `expiresAt` and marks them `EXPIRED`)

---

### FX Oracle

`src/services/fx.service.ts`

Fetches and caches the sBTC → NGN exchange rate.

```typescript
// Runs every 5 minutes via cron job
async function refreshFxRate(): Promise<void> {
  const response = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=ngn,usd'
  );
  const data = await response.json();

  // sBTC is 1:1 with BTC
  const sbtcToNgn = data.bitcoin.ngn;
  const sbtcToUsd = data.bitcoin.usd;

  await prisma.fxRateCache.create({
    data: { sbtcToNgn, sbtcToUsd }
  });
}
```

The API always returns the most recent cached rate. If the cache is older than 15 minutes (e.g. CoinGecko is down), the API returns a `stale: true` flag in the response so the frontend can show a warning.

---

### SMS Service

`src/services/sms.service.ts`

Sends SMS messages via Termii (primary) with Africa's Talking as fallback.

**Claim notification template:**
```
You've received 0.001 sBTC (~₦9,240) from a SatsPay user.

Claim it here:
satspay.xyz/claim/f47ac10b-58cc-4372

Link expires in 30 days.
Reply STOP to opt out.
```

**OTP template:**
```
Your SatsPay verification code is: 482910

Valid for 5 minutes. Do not share this code.
```

---

### Offramp Connector

`src/services/offramp.service.ts`

Handles the sBTC → NGN conversion and bank transfer flow:

1. Recipient provides bank code + account number
2. Backend verifies account name via Flutterwave/Paystack resolve API
3. Recipient confirms the account name is correct
4. Backend claims the sBTC from escrow to its own hot wallet (or uses Bitfinex/exchange API)
5. Backend initiates NGN transfer to recipient's bank account
6. Webhook from Flutterwave/Paystack confirms delivery

> **Note:** The hot wallet and sBTC → NGN conversion step requires a liquidity arrangement. For the hackathon MVP, this step is mocked. For v2, it requires either an exchange API or a liquidity partner.

---

### Hiro Webhook Listener

`src/services/webhook.service.ts`

Hiro API allows you to subscribe to contract print events and receive HTTP webhooks when they occur. Setup:

```bash
# Register webhook via Hiro API
curl -X POST https://api.hiro.so/extended/v1/webhooks \
  -H "x-hiro-api-key: $HIRO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "print",
    "contractId": "ST....satspay-escrow",
    "url": "https://api.satspay.xyz/api/v1/webhooks/hiro"
  }'
```

The webhook secret is used to verify incoming requests:
```typescript
function verifyHiroSignature(payload: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', process.env.HIRO_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

---

## Environment Variables

Create a `.env` file in the root of the project (copy from `.env.example`):

```env
# ── App ─────────────────────────────────────────────
NODE_ENV=development
PORT=4000
APP_URL=http://localhost:3000
API_URL=http://localhost:4000

# ── Database ─────────────────────────────────────────
DATABASE_URL=postgresql://postgres:password@localhost:5432/satspay

# ── JWT ──────────────────────────────────────────────
JWT_SECRET=your-super-secret-jwt-key-minimum-32-chars
JWT_EXPIRES_IN=7d

# ── Stacks ───────────────────────────────────────────
STACKS_NETWORK=testnet                  # testnet | mainnet
STACKS_API_URL=https://api.testnet.hiro.so
HIRO_API_KEY=your_hiro_api_key
HIRO_WEBHOOK_SECRET=your_webhook_secret

# Contract addresses (update after deployment)
ESCROW_CONTRACT_ADDRESS=ST...
ESCROW_CONTRACT_NAME=satspay-escrow
REGISTRY_CONTRACT_ADDRESS=ST...
REGISTRY_CONTRACT_NAME=satspay-registry
SBTC_INTERFACE_ADDRESS=ST...
SBTC_INTERFACE_NAME=satspay-sbtc-interface

# ── SMS ──────────────────────────────────────────────
SMS_PROVIDER=termii                     # termii | africas_talking
TERMII_API_KEY=your_termii_api_key
TERMII_SENDER_ID=SatsPay
AFRICAS_TALKING_API_KEY=your_at_key
AFRICAS_TALKING_USERNAME=satspay

# ── FX ───────────────────────────────────────────────
COINGECKO_API_KEY=your_coingecko_api_key
FX_CACHE_TTL_MINUTES=5
FX_STALE_THRESHOLD_MINUTES=15

# ── Offramp ──────────────────────────────────────────
OFFRAMP_PROVIDER=flutterwave           # flutterwave | paystack
FLUTTERWAVE_SECRET_KEY=FLWSECK_TEST-...
FLUTTERWAVE_PUBLIC_KEY=FLWPUBK_TEST-...
PAYSTACK_SECRET_KEY=sk_test_...

# ── Rate Limiting ────────────────────────────────────
RATE_LIMIT_WINDOW_MS=600000            # 10 minutes
RATE_LIMIT_OTP_MAX=3                   # max OTP requests per window
RATE_LIMIT_API_MAX=100                 # max API calls per window per IP
```

---

## Running Locally

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- A Stacks testnet wallet with test STX (for gas)
- [Clarinet](https://github.com/hirosystems/clarinet) (to run local devnet)

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/satspay/satspay-api
cd satspay-api

# 2. Install dependencies
npm install

# 3. Copy environment variables
cp .env.example .env
# Fill in your values

# 4. Set up the database
npx prisma migrate dev --name init
npx prisma generate

# 5. Start a local Stacks devnet (in a separate terminal)
cd ../satspay-contracts
clarinet integrate

# 6. Deploy contracts to devnet and note the addresses
clarinet deployments apply --devnet
# Copy the contract addresses into your .env

# 7. Start the API
npm run dev
# → API running at http://localhost:4000
```

### Useful Scripts

```bash
npm run dev          # Start with hot reload (tsx watch)
npm run build        # Compile TypeScript
npm run start        # Start compiled build
npm run test         # Run test suite
npm run test:watch   # Run tests in watch mode
npm run db:studio    # Open Prisma Studio (DB GUI)
npm run db:reset     # Reset and reseed database
npm run lint         # ESLint
npm run typecheck    # TypeScript check without emitting
```

---

## Testing

Tests use **Vitest** and **Supertest**. External services (Termii, Flutterwave, CoinGecko, Hiro API) are mocked.

```bash
npm run test
```

### Test Coverage

| File | Tests |
|---|---|
| `auth.test.ts` | OTP request, OTP verify, rate limiting, JWT issuance, wallet connect |
| `transfer.test.ts` | Registry lookup, escrow build, direct send build, amount validation |
| `claim.test.ts` | Get claim page, claim to wallet, expired claim, already claimed |
| `fx.test.ts` | Rate fetch, caching, stale detection, conversion math |
| `offramp.test.ts` | Account verification, payout initiation, webhook handling |
| `webhook.test.ts` | Signature verification, event processing, status updates |

---

## Deployment

The API is designed to deploy on any Node.js host. Recommended: **Railway** or **Render** for simplicity, **AWS ECS** for production scale.

### Railway (recommended for MVP)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

Set environment variables in the Railway dashboard. Add a PostgreSQL plugin for the database.

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 4000
CMD ["node", "dist/index.js"]
```

```bash
docker build -t satspay-api .
docker run -p 4000:4000 --env-file .env satspay-api
```

---

## License

MIT — see root [LICENSE](../LICENSE)
