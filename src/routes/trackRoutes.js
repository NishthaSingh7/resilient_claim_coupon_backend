const express = require("express");
const router = express.Router();

const { handleRedirect } = require("../controllers/trackController");

router.get("/:linkId", handleRedirect);

module.exports = router;