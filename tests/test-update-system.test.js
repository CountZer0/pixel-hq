const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

async function runTests() {
  console.log("=== Running Update System Decoupling Tests ===");

  const brandPath = path.resolve(__dirname, "../mods/company-brand/main.js");
  const brandSrc = fs.readFileSync(brandPath, "utf8");

  const brandUpdaterPath = path.resolve(__dirname, "../mods/company-brand/updater.js");
  const brandUpdaterSrc = fs.readFileSync(brandUpdaterPath, "utf8");

  const statusPath = path.resolve(__dirname, "../mods/company-status/main.js");
  const statusSrc = fs.readFileSync(statusPath, "utf8");

  const agentsPath = path.resolve(__dirname, "../mods/company-agents/main.js");
  const agentsSrc = fs.readFileSync(agentsPath, "utf8");

  // 1. Verify company-brand has updater logic and toast notification support
  assert.ok(brandUpdaterSrc.includes("export async function checkPixelHqUpdate"), "updater.js must export checkPixelHqUpdate");
  assert.ok(brandUpdaterSrc.includes("export async function executePixelHqUpdate"), "updater.js must export executePixelHqUpdate");
  assert.ok(brandUpdaterSrc.includes("notify({"), "updater.js must trigger native toast notification");
  assert.ok(brandUpdaterSrc.includes("timeout: 10000"), "toast notification must have 10-second timeout");
  console.log("PASS: company-brand/updater.js exports check and execute functions with 10s toast notification");

  // 2. Verify Position 1: company-brand footer & header indicator
  assert.ok(brandSrc.includes("checkPixelHqUpdate(true)"), "company-brand must check for updates on startup");
  assert.ok(brandSrc.includes('row("update-hq"'), "company-brand footer must include Update Pixel HQ row");
  assert.ok(brandSrc.includes('c === "update"'), "company-brand must listen to nextCommand for update");
  console.log("PASS: Position 1 verified in company-brand (footer row & header button with command listener)");

  // 3. Verify Position 2: company-status bottom status bar pill
  assert.ok(statusSrc.includes('id("update-status-pill")'), "company-status must include update-status-pill");
  assert.ok(statusSrc.includes('run("company-brand.update")'), "update-status-pill must trigger company-brand.update on click");
  console.log("PASS: Position 2 verified in company-status (status bar pill triggering company-brand.update)");

  // 4. Verify company-agents office floor banner has been cleanly removed
  assert.ok(!agentsSrc.includes('Pixel HQ ${this.update.version} is out'), "company-agents office floor must not render update banner");
  assert.ok(!agentsSrc.includes('btn("upd-go"'), "company-agents must not render old upd-go button");
  console.log("PASS: Obtrusive update banner cleanly eradicated from company-agents office floor");

  console.log("All Update System Decoupling tests passed!");
}

runTests().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
