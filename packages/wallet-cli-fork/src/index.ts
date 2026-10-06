#!/usr/bin/env node
/** ThaiFi Wallet CLI — agent wallet for the ThaiFi chain (chain 17). */

import { readFileSync } from "node:fs";
import { Command } from "commander";
import { login } from "./commands/login.js";
import { logout } from "./commands/logout.js";
import { whoami } from "./commands/whoami.js";
import { balance } from "./commands/balance.js";
import { transfer } from "./commands/transfer.js";
import { request } from "./commands/request.js";
import { services } from "./commands/services.js";
import { fund } from "./commands/fund.js";
import { deposit } from "./commands/deposit.js";
import { tokens } from "./commands/tokens.js";

// Resolve ../package.json at runtime (works from src/ via tsx and from dist/ when installed) — never hardcode the version here again.
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

const program = new Command();

program
  .name("thaifi")
  .description("ThaiFi Wallet CLI — pair with wallet.thaifi.com and sign with on-chain access keys")
  .version(version);

program
  .command("login")
  .description("Pair this CLI with your ThaiFi Wallet (opens the browser to approve)")
  .option("--no-browser", "Print the approval URL instead of opening a browser (headless machines)")
  .action(login);

program
  .command("logout")
  .description("Remove the local agent key (revoke on-chain access from the web wallet)")
  .action(logout);

program
  .command("whoami")
  .description("Show the paired account, agent key, balances and remaining spend limit")
  .action(whoami);

program
  .command("tokens")
  .description("List supported TIP-20 tokens (symbol, decimals, address)")
  .action(tokens);

program
  .command("balance")
  .description("Show TIP-20 token balances of the paired account")
  .option("--token <symbol|address>", "Token symbol (pathUSD, THCFI, THCOC) or contract address (default: all)")
  .action(balance);

program
  .command("transfer")
  .description("Transfer tokens signed by the agent access key (spend limit enforced on-chain)")
  .argument("<to>", "Recipient address (0x…)")
  .argument("<amount>", "Amount in human units (e.g. 1.5)")
  .option("--token <symbol|address>", "Token symbol or contract address (default: pathUSD)")
  .option("--fee-token <symbol|address>", "Gas token (default: auto — pathUSD, else THCFI/THCOC by balance)")
  .action(transfer);

program
  .command("fund")
  .description("Show your deposit address and open the web Deposit page")
  .option("--no-browser", "Print the address without opening a browser")
  .action(fund);

program
  .command("deposit")
  .description(
    "PromptPay QR top-up (1 THB = 1 token): create a QR order, show it for the user to scan, and wait until the tokens are minted",
  )
  .option("--amount <thb>", "Amount in THB (6-10000)")
  .option("--token <symbol>", "Payout token: THCFI (default) or THCOC")
  .option("--ref <referenceNo>", "Watch an existing order instead of creating a new one")
  .option("--no-open", "Do not open the saved QR image in a viewer")
  .option("--json", "Machine-readable output (JSON)")
  .action(deposit);

program
  .command("request")
  .description("HTTP request with automatic x402/MPP payments (curl-like)")
  .argument("<url>")
  .option("-X, --method <method>", "HTTP method", "GET")
  .option("-H, --header <pairs...>", "Headers as 'Key: Value'", [])
  .option("-d, --data <body>", "Request body")
  .option("--json <json>", "JSON body shorthand (sets method POST + content-type)")
  .option("--dry-run", "Print the request without sending")
  .option("--max-spend <usd>", "Maximum automatic payment (USD)", Number)
  .option("--fee-token <symbol|address>", "Gas token for the payment tx (default: auto — pathUSD, else THCFI/THCOC by balance)")
  .action(async (url, opts) => {
    const headers: Record<string, string> = {};
    for (const h of opts.header ?? []) {
      const idx = h.indexOf(":");
      if (idx > 0) headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
    }
    let body = opts.data;
    let method = opts.method;
    if (opts.json) {
      body = opts.json;
      method = "POST";
      headers["Content-Type"] = "application/json";
    }
    await request(url, {
      method,
      headers,
      body,
      dryRun: opts.dryRun,
      maxSpend: opts.maxSpend,
    });
  });

program
  .command("services")
  .description("Discover paid services from the MPP/x402 registry")
  .option("--search <query>", "Search services")
  .action(services);

program.parseAsync();
