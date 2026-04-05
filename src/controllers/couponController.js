const pool = require("../utils/db");
const { v4: uuidv4 } = require("uuid");

const claimCoupon = async (req, res) => {
  const { userId, offerId } = req.body;

  const client = await pool.connect();

  try {
    // Start transaction
    await client.query("BEGIN");

    // Lock the offer row (prevents race condition)
    const offerResult = await client.query(
      "SELECT max_coupons FROM offers WHERE id = $1 FOR UPDATE",
      [offerId],
    );

    if (offerResult.rows.length === 0) {
      throw new Error("Offer not found");
    }

    const maxCoupons = offerResult.rows[0].max_coupons;

    // Count existing coupons for this offer
    const countResult = await client.query(
      "SELECT COUNT(*) FROM coupons WHERE offer_id = $1",
      [offerId],
    );

    const currentCount = parseInt(countResult.rows[0].count);

    // Check limit
    if (currentCount >= maxCoupons) {
      throw new Error("Coupon limit reached");
    }

    // Insert coupon
    const couponId = uuidv4();
    const couponCode = `COUPON-${Date.now()}`;

    const insertResult = await client.query(
      `INSERT INTO coupons (id, user_id, offer_id, code)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
      [couponId, userId, offerId, couponCode],
    );

    // Commit transaction
    await client.query("COMMIT");

    return res.status(201).json({
      message: "Coupon claimed successfully",
      coupon: insertResult.rows[0],
    });
  } catch (error) {
    // Rollback on failure
    await client.query("ROLLBACK");

    // Handle duplicate user case (UNIQUE constraint)
    if (error.code === "23505") {
      return res.status(400).json({
        message: "User already claimed this offer",
      });
    }

    return res.status(400).json({
      message: error.message,
    });
  } finally {
    client.release();
  }
};

module.exports = { claimCoupon };
