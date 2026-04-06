const pool = require("../utils/db");
const axios = require("axios");

const WEBHOOK_URL = "http://localhost:4000/conversion";

// Send webhook
const sendWebhook = async (orderId, offerId, amount) => {
  try {
    await axios.post(WEBHOOK_URL, {
      orderId,
      offerId,
      amount,
    });

    // Mark success
    await pool.query(
      `UPDATE webhook_events 
             SET status = 'SUCCESS', last_attempt_at = NOW()
             WHERE order_id = $1`,
      [orderId],
    );
  } catch (error) {
    // Mark failed
    await pool.query(
      `UPDATE webhook_events 
             SET status = 'FAILED', 
                 retry_count = retry_count + 1,
                 last_attempt_at = NOW()
             WHERE order_id = $1`,
      [orderId],
    );
  }
};
const retryFailedWebhooks = async () => {
  const result = await pool.query(
    `SELECT order_id FROM webhook_events 
         WHERE status = 'FAILED' AND retry_count < 5`,
  );

  for (const row of result.rows) {
    const orderRes = await pool.query(`SELECT * FROM orders WHERE id = $1`, [
      row.order_id,
    ]);

    const order = orderRes.rows[0];

    await sendWebhook(order.id, order.offer_id, order.amount);
  }
};

module.exports = { sendWebhook, retryFailedWebhooks };

// module.exports = { sendWebhook };
