const { spawnSync } = require("child_process");
const path = require("path");

const dotenv = require("dotenv");
const envPath = path.resolve(__dirname, "../../.env");
const dotenvResult = dotenv.config({ path: envPath });

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node prisma-run.js <prisma-args...>");
  process.exit(1);
}

const cwd = path.resolve(__dirname, "..");
const isWin = process.platform === "win32";
const cmd = isWin ? "npx.cmd" : "npx";

if (dotenvResult && dotenvResult.parsed) {
  Object.keys(dotenvResult.parsed).forEach((k) => {
    process.env[k] = dotenvResult.parsed[k];
  });
}
const childEnv = Object.assign({}, process.env);
const res = spawnSync(cmd, ["prisma", ...args], {
  stdio: "inherit",
  cwd,
  env: childEnv,
});
process.exit(res.status || 0);
