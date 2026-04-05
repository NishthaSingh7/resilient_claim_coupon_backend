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
