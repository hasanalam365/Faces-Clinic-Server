// config/gocardless.js
const gocardlessModule = require("gocardless-nodejs");
const { Environments } = require("gocardless-nodejs/constants");

const gocardlessFactory =
  typeof gocardlessModule === "function"
    ? gocardlessModule
    : gocardlessModule.default;

if (typeof gocardlessFactory !== "function") {
  throw new Error(
    "Could not resolve the gocardless-nodejs client factory — check your installed version of the package."
  );
}

const client = gocardlessFactory(
  process.env.GOCARDLESS_ACCESS_TOKEN,
  process.env.GOCARDLESS_ENVIRONMENT === "live"
    ? Environments.Live
    : Environments.Sandbox,
  { raiseOnIdempotencyConflict: true }
);

module.exports = client;
