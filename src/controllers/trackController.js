const pool = require("../utils/db");

// This is the Fallback URL which is fetched from .env
const FALLBACK_URL = process.env.FALLBACK_URL || "https://www.togethr.in/";

// Function for handling redirect
const handleRedirect = async (req, res) => {
  const { linkId } = req.params;
  const { ref } = req.query;
  const ip = req.ip;

  // Default to fallback url (fail-safe)
  let destinationUrl = FALLBACK_URL;

  try {
    // Fetching destination URL
    const result = await pool.query(
      "SELECT destination_url FROM links WHERE id = $1",
      [linkId],
    );

    // If link exists, override the fallback url
    if (result.rows.length > 0) {
      destinationUrl = result.rows[0].destination_url;
    }
  } catch (error) {
    //In case of DB failure system silently fallbacks
    console.error("DB error:", error.message);
  }

  // Always redirect to url
  res.redirect(destinationUrl);

  // logging all details in the click_logs table
  pool
    .query(
      `INSERT INTO click_logs (id, link_id, ref, ip_address)
         VALUES (gen_random_uuid(), $1, $2, $3)`,
      [linkId, ref || null, ip],
    )
    .catch((err) => {
      console.error("Click log failed:", err.message);
    });
};

module.exports = { handleRedirect };
