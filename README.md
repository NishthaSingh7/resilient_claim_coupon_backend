# Part 1 — Redirect and Click Tracking

## Requirements

This endpoint handles user clicks on tracking links:

```
GET /track/:linkId?ref=instagram
```

The system performs two operations:

* Redirect the user to the destination URL
* Log the click event (linkId, ref, IP, timestamp)

---

## Design Priorities

* Redirect must always succeed (highest priority)
* Logging is non-critical and can fail silently
* The user should never see an error page

---

## Approach

* A fallback URL is used in case:

  * The link is not found
  * The database fails
* Redirect is always executed
* Logging is handled asynchronously and independently
* All click data is stored in the `click_logs` table

---

## Route Handler Implementation

```js
const pool = require('../utils/db');

// Fallback URL fetched from environment
const FALLBACK_URL = process.env.FALLBACK_URL || "https://www.togethr.in/";

// Function to handle redirect
const handleRedirect = async (req, res) => {
    const { linkId } = req.params;
    const { ref } = req.query;
    const ip = req.ip;

    // Default to fallback URL (fail-safe)
    let destinationUrl = FALLBACK_URL;

    try {
        // Fetch destination URL from database
        const result = await pool.query(
            'SELECT destination_url FROM links WHERE id = $1',
            [linkId]
        );

        // If link exists, override fallback URL
        if (result.rows.length > 0) {
            destinationUrl = result.rows[0].destination_url;
        }

    } catch (error) {
        // On DB failure, fallback silently
        console.error("DB error:", error.message);
    }

    // Always redirect
    res.redirect(destinationUrl);

    // Asynchronous logging (non-blocking)
    pool.query(
        `INSERT INTO click_logs (id, link_id, ref, ip_address)
         VALUES (gen_random_uuid(), $1, $2, $3)`,
        [linkId, ref || null, ip]
    ).catch(err => {
        console.error('Click log failed:', err.message);
    });
};

module.exports = { handleRedirect };
```

---

## Key Design Decisions

### 1. Fail-safe Default (Fallback First)

```
let destinationUrl = FALLBACK_URL;
```

* Ensures a valid redirect before any database interaction
* Protects against database downtime or missing data

---

### 2. Database Wrapped in Try-Catch

* Prevents system crashes if the database is slow or unavailable
* Guarantees graceful fallback behavior

---

### 3. Redirect Outside Try-Catch

```
res.redirect(destinationUrl);
```

* Ensures redirect always executes
* Independent of database success or failure

---

### 4. Asynchronous Logging (Non-blocking)

```
pool.query(...).catch(...)
```

* Logging does not delay the redirect
* Failures in logging do not impact user experience

---

### 5. No Await on Logging

* Avoids unnecessary latency
* Keeps redirect fast and responsive

---

## Failure Handling

| Scenario        | Behavior                 |
| --------------- | ------------------------ |
| Valid link      | Redirect to destination  |
| Invalid link    | Redirect to fallback     |
| DB failure      | Redirect to fallback     |
| Logging failure | Ignored (no user impact) |

---

## Result

This design ensures:

* Guaranteed redirect in all scenarios
* Fast response time with no blocking operations
* Resilience to database failures
* Logging is handled independently and does not affect the redirect flow

The system prioritizes user experience by ensuring that redirect logic is never dependent on database or logging reliability.

---

## Demo

https://drive.google.com/file/d/18FaRdvfEExZTlDoY681Wkmsxln4PgSMc/view?usp=sharing

# Part 2 — Coupon Claiming

## Requirements

Endpoint:

```http
POST /claim-coupon
Body: { userId, offerId }
```

System must guarantee:

* A user can claim only one coupon per offer
* Each offer has a fixed maximum number of coupons
* Concurrent requests from the same user should result in only one coupon
* When multiple users compete for the last coupon, only one should succeed

---

## Design Approach

The solution combines:

* **Database constraints** for correctness
* **Transactions and row-level locking** for concurrency safety

---

## Schema

### Offers Table

```sql
CREATE TABLE offers (
    id UUID PRIMARY KEY,
    title TEXT,
    max_coupons INT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

### Users Table

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    name TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

### Coupons Table

```sql
CREATE TABLE coupons (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    offer_id UUID REFERENCES offers(id),
    code TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT unique_user_offer UNIQUE (user_id, offer_id)
);
```

---

## Endpoint Implementation

```js
const pool = require('../utils/db');
const { v4: uuidv4 } = require('uuid');

const claimCoupon = async (req, res) => {
    const { userId, offerId } = req.body;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Lock offer row to prevent concurrent modifications
        const offerResult = await client.query(
            'SELECT max_coupons FROM offers WHERE id = $1 FOR UPDATE',
            [offerId]
        );

        if (offerResult.rows.length === 0) {
            throw new Error('Offer not found');
        }

        const maxCoupons = offerResult.rows[0].max_coupons;

        // Count existing coupons
        const countResult = await client.query(
            'SELECT COUNT(*) FROM coupons WHERE offer_id = $1',
            [offerId]
        );

        const currentCount = parseInt(countResult.rows[0].count);

        // Enforce limit
        if (currentCount >= maxCoupons) {
            throw new Error('Coupon limit reached');
        }

        // Insert coupon
        const couponId = uuidv4();
        const couponCode = `COUPON-${Date.now()}`;

        const insertResult = await client.query(
            `INSERT INTO coupons (id, user_id, offer_id, code)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [couponId, userId, offerId, couponCode]
        );

        await client.query('COMMIT');

        return res.status(201).json({
            message: 'Coupon claimed successfully',
            coupon: insertResult.rows[0]
        });

    } catch (error) {
        await client.query('ROLLBACK');

        if (error.code === '23505') {
            return res.status(400).json({
                message: 'User already claimed this offer'
            });
        }

        return res.status(400).json({
            message: error.message
        });

    } finally {
        client.release();
    }
};

module.exports = { claimCoupon };
```

---

## Key Design Decisions

### 1. Unique Constraint

```sql
UNIQUE (user_id, offer_id)
```

* Prevents duplicate coupon claims by the same user
* Enforced at the database level

---

### 2. Transaction (BEGIN / COMMIT)

* Ensures atomicity
* Either all operations succeed or none

---

### 3. Row-Level Locking

```sql
SELECT ... FOR UPDATE
```

* Locks the offer row
* Serializes concurrent requests for the same offer
* Prevents race conditions

---

### 4. Limit Check Inside Transaction

* Coupon count is checked after acquiring the lock
* Ensures accurate count under concurrency

---

## Test Cases

### Case 1 — Normal Flow

* User claims coupon successfully
* Coupon is created

---

### Case 2 — Same User Multiple Requests

* Second request fails
* Handled by unique constraint

---

### Case 3 — Limit Reached

* Once max_coupons is reached
* All further requests are rejected

---

### Case 4 — Concurrent Requests (Multiple Users)

* Parallel requests sent using Promise.all
* Only up to max_coupons succeed
* Remaining requests fail with "Coupon limit reached"

---

## Answers to Questions

### 1. What prevents offer limit breach under high concurrency?

Row-level locking (`SELECT ... FOR UPDATE`) ensures that only one transaction can evaluate and update coupon count for an offer at a time. This prevents multiple requests from simultaneously passing the limit check.

---

### 2. Code-level vs DB-level enforcement

The limit check is enforced inside a database transaction with locking. Application-level checks alone are not reliable under concurrency. Database-level guarantees ensure correctness.

---

### 3. 200 users, limit = 200

* All requests start concurrently
* Transactions acquire the lock one by one
* Each transaction checks count and inserts
* First 200 succeed
* Remaining requests fail after limit is reached

There is no overselling because each transaction sees a consistent state due to locking. The only potential bottleneck is reduced throughput due to serialization, but correctness is preserved.

---

## Summary

* Database constraints ensure correctness
* Transactions ensure atomicity
* Row-level locking ensures concurrency safety

The system guarantees that coupon issuance remains consistent and within limits even under high concurrency.

