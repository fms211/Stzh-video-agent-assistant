"use strict";
const router = require("express").Router();
const { createWeatherService } = require("../weather-service");
const weather = createWeatherService();
router.get("/api/weather", async (_req, res) => {
  // Query/body cannot change the host, credential or billable location.
  res.set("Cache-Control", "no-store");
  res.json(await weather.current());
});
module.exports = router;
