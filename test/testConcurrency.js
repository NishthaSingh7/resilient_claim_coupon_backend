const axios = require("axios");

const offerId = "22222222-2222-2222-2222-222222222222";

// Different users to simulate real concurrency
const users = [
  "41111111-1111-1111-1111-111111111111",
  "44444444-4444-4444-4444-444444444444",
  "53333333-3333-3333-3333-333333333333",
];

async function runTest() {
  console.log("Testcase 4 : Simulate concurrency.\n");
  console.log("Testing multiple users clicking at once !\n");
  const requests = users.map((userId) => {
    return axios
      .post("http://localhost:3000/claim-coupon", {
        userId,
        offerId,
      })
      .then((res) => {
        return {
          userId,
          status: "SUCCESS",
          data: res.data,
        };
      })
      .catch((err) => {
        return {
          userId,
          status: "FAILED",
          error: err.response?.data || err.message,
        };
      });
  });

  // This runs all requests in parallel
  const results = await Promise.all(requests);

  console.log("\n Results:\n");
  console.table(results);
}

runTest();
