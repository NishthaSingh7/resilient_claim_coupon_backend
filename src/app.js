const { retryFailedWebhooks } = require("./services/webhookService");

require("dotenv").config();
const pool = require("./utils/db");
const couponRoutes = require("./routes/couponRoutes");
const orderRoutes = require("./routes/orderRoutes");

pool
  .query("SELECT NOW()")
  .then(() => console.log("DB connected ✅"))
  .catch((err) => console.error("DB error ❌", err));
const express = require("express");

const app = express();
app.use(express.json());

// Routes
const trackRoutes = require("./routes/trackRoutes");
// part 1 - track order
app.use("/track", trackRoutes);
// part 2 - claim coupon
app.use("/claim-coupon", couponRoutes);
// part 3 - create order
app.use("/order", orderRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on the port ${PORT}`);
});

// For automation, call retryFailedWebhooks
// setTimeout(() => {
//   retryFailedWebhooks();
// }, 5000);
