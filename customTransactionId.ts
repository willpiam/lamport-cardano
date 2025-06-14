

/*
    Off-chain version of the logic for the `custom_transaction_id` as defined in 
    /lamport-cardano/lamport-validator/lib/custom_transaction_id.ak

*/

import { fromHex, toHex } from "npm:@blaze-cardano/core";
import { sha256 } from "./sha256.ts";
import {
  assertEquals,
  assertExists,
  assertRejects,
  assert,
} from "@std/assert";
import { Constr, Data, getInputIndices, TxSignBuilder, UTxO, LucidEvolution, CML, getAddressDetails} from "npm:@lucid-evolution/lucid@0.4.29";
import { Value, ValidityRange, ReferenceInputs, OutputReference, OutputReferenceList, HashBlake2b224Schema, ListExtraSignatories, Certificates } from "./datatypes/index.ts";
import { getInput } from "./utils.ts";
import { encode } from "node:punycode";

export type CustomTransactionId = Uint8Array

export class CustomTransactionIdBuilder {
    private inputs: Uint8Array | undefined
    private reference_inputs: Uint8Array | undefined
    private outputs: Uint8Array | undefined
    private fee: Uint8Array | undefined
    private mint: Uint8Array | undefined
    private certificates: Uint8Array | undefined
    private withdrawals: Uint8Array | undefined
    private validity_range: Uint8Array | undefined
    private extra_signatories: Uint8Array | undefined
    private redeemers: Uint8Array | undefined
    private datums: Uint8Array | undefined
    private votes: Uint8Array | undefined
    private proposal_procedures: Uint8Array | undefined
    private current_treasury_amount: Uint8Array | undefined
    private treasury_donation: Uint8Array | undefined

    constructor() {}

    public static async customTransactionId(tx: TxSignBuilder, lucid: LucidEvolution, additionalSigners: string[] = []) {
        const txObj = tx.toJSON() as any
        // console.log(txObj)
      
        return await new CustomTransactionIdBuilder()
            .withMint(txObj.body.mint)
            .withTreasuryDonation(txObj.body.treasury_donation)
            .withCurrentTreasuryAmount(txObj.body.current_treasury_amount)
            .withReferenceInputs(txObj.body.reference_inputs ?? [])
            .withExtraSignatories(additionalSigners)
            .withWithdrawals(txObj.body.withdrawals ?? {})
            // .withCertificates(txObj.body.certs ?? [])
            .build()
    }

    /*
        for now we will assume that the both bounds are specified
        -- what if its not incorrectly formatted? its just the wrong data? 
    */
    withValidityRange(validity_interval_start: number, ttl: number) {
        console.log(`%cvalidity_interval_start: ${validity_interval_start}`, "color: green")
        console.log(`%cttl: ${ttl}`, "color: green")
        const range = Data.to<ValidityRange>( {
            lower_bound: {
                bound_type: {
                    Finite: {
                        value: BigInt(validity_interval_start)
                    }
                },
                is_inclusive: true,
            },
            upper_bound: {
                bound_type: {
                    Finite: {
                        value: BigInt(ttl)
                    }
                },
                is_inclusive: true,
            }
        }, ValidityRange, 
        // {canonical: true}
        )
        console.log(`%cValidity range bytes: ${range}`, "color: cyan")
        this.validity_range = fromHex(range)
        console.log(`%crange: ${range}`, "color: green")
        console.log(`%cvalidity_range: ${this.validity_range}`, "color: green")
        return this
    }

    /*
        withInputs
        @in list of objects with a transaction id (hex string) and an index

        Given the utxo objects you need to construct an object to mirror aikens "Output" type
        The output type is defined as:

        ```
        Output {
            address: Address,
            value: Value,
            datum: Datum,
            reference_script: Option<ScriptHash>,
        }
        ```

        After a list of these object is constructed you need to serialize it using the mirror of builtin.serialise_data

        This function is the off-chain mirror of the `with_inputs` function in the `custom_transaction_id.ak` file
    */
    withInputs(inputs: any[]) {
        // TODO: process inputs before adding them to the builder
        this.inputs = new Uint8Array()
        return this
    }

    withReferenceInputs(reference_inputs: any[]) {
        const references = reference_inputs.map((input: any) => ({transaction_id: input.transaction_id, output_index: BigInt(input.index)}))
        const encoded : string = Data.to(references, OutputReferenceList)
        this.reference_inputs = fromHex(encoded)
        return this
    }
   
    withOutputs(outputs: any[]) {
        // TODO: process outputs before adding them to the builder
        this.outputs = new Uint8Array()
        return this
    }

    withFee(fee: number) {
        const serializedFee = Data.to(new Constr(0, [BigInt(fee)]))
        this.fee = fromHex(serializedFee)
        return this
    }

    withTreasuryDonation(treasury_donation: number | undefined) {
        if (undefined === treasury_donation) {
            console.log("%ctreasury donation is undefined, giving None", "color: purple")
            this.treasury_donation = fromHex(Data.to(new Constr(1, [])))
            return this
        }
        console.log(`treasury donation is ${treasury_donation}`)
        const serializedTreasuryDonation = Data.to(new Constr(0, [BigInt(treasury_donation)]))
        this.treasury_donation = fromHex(serializedTreasuryDonation)
        return this
    }

    withMint(mint: any) {
        const mintObj = Object.keys(mint)
            .reduce((acc, key) => {
                acc.set(key, new Map(Object.entries(mint[key]).map(([k, v] : [string, any]) => [k, BigInt(v)])))
                return acc
            }, new Map<string, Map<string, bigint>>())
        const preimage = Data.to<Value>(mintObj, Value, {canonical: true})
        this.mint = fromHex(preimage)
        return this
    }

    withCurrentTreasuryAmount(current_treasury_amount: number | undefined) {
        if (undefined === current_treasury_amount) {
            console.log("%ccurrent treasury amount is undefined, giving None", "color: purple")
            this.current_treasury_amount = fromHex(Data.to(new Constr(1, [])))
            return this
        }
        const serializedCurrentTreasuryAmount = Data.to(new Constr(0, [BigInt(current_treasury_amount)]))
        this.current_treasury_amount = fromHex(serializedCurrentTreasuryAmount)
        return this
    }

    withExtraSignatories(additionalSigners: string[]) {
        const extra_signatories = Data.to(additionalSigners, ListExtraSignatories)
        this.extra_signatories = fromHex(extra_signatories)
        return this
    }

    withCertificates(certificates: any[]) {
        console.log("Certificates: ", certificates)
        assertExists(certificates, "Certificates must be defined in the build step")
        const formated = certificates.map((cert: any) => {
            if (Object.keys(cert).includes("RegDrepCert")) {
                return {
                    RegisterCredential: {
                        delegate_representative: {
                            VerificationKey: cert.RegDrepCert.drep_credential.PubKey.hash
                        },
                        deposit: cert.RegDrepCert.deposit, 
                    }
                }
            }
            return cert
        }).filter((cert: any) => cert !== null)
        console.log("Formated: ", formated)
        const encoded = Data.to(formated, Certificates)
        this.certificates = fromHex(encoded)
        return this
    }

    withWithdrawals(withdrawals: any) {
        console.log(`${'-'.repeat(100)}`)
        console.log("Withdrawals: ", withdrawals)
        const pairs : [string, bigint][] = Object.keys(withdrawals).map((stakeAddress : string) => {
          const credential = getAddressDetails(stakeAddress).stakeCredential 
          assertExists(credential, "Stake credential must exist")
          return [credential.hash, BigInt(withdrawals[stakeAddress])]
        })
        console.log("Pairs: ", pairs)
        const encodedPairs = pairs.map((pair : [string, bigint]) => {
            return new Constr(0, [pair[0], pair[1]])
        });
        console.log("Encoded pairs: ", encodedPairs)
        const encoded = Data.to(pairs)
        console.log("Encoded withdrawals: ", encoded)
        this.withdrawals = fromHex(encoded)
        return this
    }

    // todo: 'with' functions should build the blob
    //       build will just hash it 
    async build() : Promise<CustomTransactionId> {
        // todo: actually serialize the transaction builder 
        assertExists(this.mint, "Mint must be defined in the build step")
        assertExists(this.treasury_donation, "Treasury donation must be defined in the build step")
        assertExists(this.current_treasury_amount, "Current treasury amount must be defined in the build step")
        assertExists(this.reference_inputs, "Reference inputs must be defined in the build step")
        assertExists(this.extra_signatories, "Extra signatories must be defined in the build step")
        assertExists(this.withdrawals, "Withdrawals must be defined in the build step")
        // assertExists(this.validity_range, "Validity range must be defined")

        // const blob = new Uint8Array(this.mint.length + this.validity_range.length)
        const blob = new Uint8Array(
            this.mint.length + 
            this.treasury_donation.length + 
            this.current_treasury_amount.length +
            this.reference_inputs.length + 
            this.extra_signatories.length +
            this.withdrawals.length
        )
        blob.set(this.mint, 0)
        blob.set(this.treasury_donation, this.mint.length)
        blob.set(this.current_treasury_amount, this.mint.length + this.treasury_donation.length)
        blob.set(this.reference_inputs, this.mint.length + this.treasury_donation.length + this.current_treasury_amount.length)
        blob.set(this.extra_signatories, this.mint.length + this.treasury_donation.length + this.current_treasury_amount.length + this.reference_inputs.length)
        blob.set(this.withdrawals, this.mint.length + this.treasury_donation.length + this.current_treasury_amount.length + this.reference_inputs.length + this.extra_signatories.length)
        console.log(`%cblob: ${toHex(blob)}`, "color: yellow")
        return await sha256(blob)
    }
}
