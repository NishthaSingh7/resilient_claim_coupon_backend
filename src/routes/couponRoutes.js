const express = require("express");
const router = express.Router();

const { claimCoupon } = require("../controllers/couponController");

router.post("/", claimCoupon);

module.exports = router;
