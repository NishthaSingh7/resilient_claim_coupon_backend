require('dotenv').config();
const pool = require("./utils/db");
const couponRoutes = require("./routes/couponRoutes");

pool
  .query("SELECT NOW()")
  .then(() => console.log("DB connected ✅"))
  .catch((err) => console.error("DB error ❌", err));
const express = require('express');

const app = express();
app.use(express.json());

// Routes
const trackRoutes = require('./routes/trackRoutes');
app.use('/track', trackRoutes);

app.use("/claim-coupon", couponRoutes);
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on the port ${PORT}`);
});