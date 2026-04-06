const pool = require("../utils/db");
const { v4: uuidv4 } = require("uuid");
const { sendWebhook } = require("../services/webhookService");

const createOrder = async (req, res) => {
  const { userId, offerId, couponCode, amount } = req.body;

  const client = await pool.connect();

  let order;

  try {
    await client.query("BEGIN");

    // 1. Validate coupon
    const couponResult = await client.query(
      `SELECT * FROM coupons 
             WHERE code = $1 AND user_id = $2 AND offer_id = $3 
             FOR UPDATE`,
      [couponCode, userId, offerId],
    );

    if (couponResult.rows.length === 0) {
      throw new Error("Invalid coupon");
    }

    const coupon = couponResult.rows[0];

    if (coupon.is_used) {
      throw new Error("Coupon already used");
    }

    // 2. Mark coupon as used
    await client.query(`UPDATE coupons SET is_used = TRUE WHERE id = $1`, [
      coupon.id,
    ]);

    // 3. Create order
    const orderId = uuidv4();

    const orderResult = await client.query(
      `INSERT INTO orders (id, user_id, offer_id, coupon_id, amount)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
      [orderId, userId, offerId, coupon.id, amount],
    );

    order = orderResult.rows[0];

    // 4. Insert webhook event (PENDING)
    await client.query(
      `INSERT INTO webhook_events (id, order_id, status)
             VALUES ($1, $2, 'PENDING')`,
      [uuidv4(), orderId],
    );

    await client.query("COMMIT");

    // 5. Call webhook OUTSIDE transaction, does not affect order creation flow
    sendWebhook(orderId, offerId, amount);

    return res.status(201).json({
      message: "Order created successfully",
      order,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    return res.status(400).json({
      message: error.message,
    });
  } finally {
    client.release();
  }
};

module.exports = { createOrder };
