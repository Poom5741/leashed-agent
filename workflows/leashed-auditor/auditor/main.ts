import {
	consensusIdenticalAggregation,
	cre,
	type HTTPSendRequester,
	json,
	Runner,
	type Runtime,
} from '@chainlink/cre-sdk'
import { keccak_256 } from '@noble/hashes/sha3.js'

export type Config = {
	schedule: string
	// where the agent's receipt ledger is served (dashboard API)
	receiptsUrl: string
	// per-30-days credit cap in THCFI base units (6 decimals)
	creditCapBase: string
	// Sepolia chain selector for the attestation write
	chainSelector: string
	// attestation receiver address on Sepolia (deployed receiver in production;
	// simulation targets this address for the report write)
	attestTo: string
}

type Receipt = {
	id?: string
	rail?: string
	status?: string
	amountBase?: string
	token?: { symbol?: string }
	txHash?: string
	txUrl?: string
}

type AuditState = {
	receipts?: Receipt[]
	agent?: { limitLeft?: string }
}

type AuditResult = {
	verdict: 'PASS' | 'FAIL'
	checked: number
	totalBase: number
	otherBase: number
	problems: string[]
}

// ---------- audit logic (deterministic, consensus-aggregated) ----------

function auditReceipts(state: AuditState, creditCapBase: string): AuditResult {
	const problems: string[] = []
	const receipts = state.receipts ?? []
	const knownRails = ['thaifi-mpp', 'cardano-x402']

	let totalBase = 0
	let otherBase = 0
	for (const r of receipts) {
		if (!r.id) problems.push(`receipt missing id`)
		if (!knownRails.includes(r.rail ?? '')) problems.push(`receipt ${r.id}: unknown rail ${r.rail}`)
		if (r.status !== 'paid') problems.push(`receipt ${r.id}: status ${r.status}`)
		if (!r.txHash || !/^(0x)?[0-9a-fA-F]{64}$/.test(r.txHash ?? '')) problems.push(`receipt ${r.id}: no tx hash`)
		if (!/^\d+$/.test(r.amountBase ?? '')) problems.push(`receipt ${r.id}: amountBase not integer`)
		else if ((r.token?.symbol ?? '') === 'THCFI') totalBase += Number(r.amountBase)
		else otherBase += Number(r.amountBase)
	}
	// cross-check against the wallet's on-chain leash accounting (THCFI).
	// leash spend (cap - left) may exceed the ledger total: gas is drawn through
	// the same keychain but is not a receipt. Ledger exceeding leash = forgery.
	const leashLeft = Number((state.agent?.limitLeft ?? '').match(/THCFI ([\d,.]+)/)?.[1]?.replace(/,/g, '') ?? '0')
	const cap = Number(creditCapBase)
	const leashSpend = cap - leashLeft * 1e6
	if (leashLeft > 0 && totalBase > leashSpend) {
		problems.push(`ledger total ${totalBase} exceeds on-chain leash spend ${leashSpend}`)
	}

	return { verdict: problems.length === 0 ? 'PASS' : 'FAIL', checked: receipts.length, totalBase, otherBase, problems }
}

// ---------- ABI encoding for audit(string,uint256,uint256,uint256) ----------

function keccakSelector(sig: string): string {
	return Buffer.from(keccak_256(new TextEncoder().encode(sig))).toString('hex').slice(0, 8)
}

function abiEncodeAudit(verdict: string, checked: number, totalBase: number, timestamp: number): string {
	const sel = keccakSelector('audit(string,uint256,uint256,uint256)')
	const encUint = (n: bigint | number) => Buffer.from(BigInt(n).toString(16).padStart(64, '0'), 'hex')
	const encString = (s: string) => {
		const bytes = Buffer.from(s, 'utf8')
		const padded = Buffer.concat([bytes, Buffer.alloc((32 - (bytes.length % 32)) % 32)])
		return Buffer.concat([encUint(bytes.length), padded])
	}
	return '0x' + sel + Buffer.concat([encUint(0x80), encString(verdict), encUint(checked), encUint(totalBase), encUint(timestamp)]).toString('hex')
}

// ---------- workflow ----------

const fetchReceipts = (sendRequester: HTTPSendRequester, config: Config): string => {
	const resp = sendRequester
		.sendRequest({
			url: config.receiptsUrl,
			method: 'GET' as const,
		})
		.result()
	// json() decodes the HTTPResponse body; re-stringify for consensus aggregation
	return JSON.stringify(json(resp))
}

export const onCronTrigger = (runtime: Runtime<Config>): string => {
	runtime.log('CRE auditor: fetching agent receipt ledger …')

	const raw = new cre.capabilities
		.HTTPClient()
		.sendRequest(runtime, fetchReceipts, consensusIdenticalAggregation<string>())(runtime.config)
		.result()

	const state = JSON.parse(raw) as AuditState
	const result = auditReceipts(state, runtime.config.creditCapBase)

	runtime.log(`audit result: ${result.verdict} | checked=${result.checked} | totalBase=${result.totalBase}`)
	for (const p of result.problems) runtime.log(`  problem: ${p}`)

	// Attestation write on Sepolia: audit(string,uint256,uint256,uint256)
	const calldata = abiEncodeAudit(result.verdict, result.checked, result.totalBase, Date.now())
	const evm = new cre.capabilities.EVMClient(BigInt(runtime.config.chainSelector))
	const reply = evm
		.callContract(runtime, {
			call: {
				to: runtime.config.attestTo,
				data: calldata,
			},
		})
		.result()

	runtime.log(`attestation written to ${runtime.config.attestTo} (sepolia)`)
	runtime.log(`attestation reply: ${Buffer.from(reply.data).toString('hex').slice(0, 64)}`)

	return JSON.stringify({
		verdict: result.verdict,
		checked: result.checked,
		totalBase: result.totalBase,
		otherBase: result.otherBase,
		problems: result.problems,
		attestationTo: runtime.config.attestTo,
		at: new Date().toISOString(),
	})
}

export const initWorkflow = (config: Config) => {
	const cron = new cre.capabilities.CronCapability()
	return [cre.handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)]
}

export async function main() {
	const runner = await Runner.newRunner<Config>()
	await runner.run(initWorkflow)
}
