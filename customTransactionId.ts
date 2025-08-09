

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
import { Constr, Data, getInputIndices, TxSignBuilder, UTxO, LucidEvolution, CML, getAddressDetails, Credential, sortUTxOs, validatorToScriptHash, Validator, ScriptType} from "npm:@lucid-evolution/lucid@0.4.29";
import { Value, ValidityRange, ReferenceInputs, OutputReference, OutputReferenceList, HashBlake2b224Schema, ListExtraSignatories, Certificates, CredentialSchema, Credential as CredentialType , Output as OutputType, OutputList, Address} from "./datatypes/index.ts";

import { getInput } from "./utils.ts";

/*
    https://github.com/leobel/janus-wallet/blob/main/frontend/janus/src/utils/hashing.ts#L169
*/

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

    /*
        parameters:
        tx
        lucid
        additionalSigners
        extraInputs --> use to inject inputs missing from your draft tx
    */
    public static async customTransactionId(tx: TxSignBuilder, lucid: LucidEvolution, additionalSigners: string[] = [], extraInputs : UTxO[] = []) {
        const txObj = tx.toJSON() as any
        // console.log(txObj)
        // console.log(`json tx outputs --> `, txObj.body.outputs)

        const cmlTxBody = tx.toTransaction().body()

        return await new CustomTransactionIdBuilder()
            .withMint(txObj.body.mint)
            .withTreasuryDonation(txObj.body.treasury_donation)
            .withCurrentTreasuryAmount(txObj.body.current_treasury_amount)
            .withReferenceInputs(txObj.body.reference_inputs ?? [])
            .withExtraSignatories(additionalSigners)
            // withdrawals excluded due to ordering ambiguities between Data.Map encodings
            // inputs excluded to avoid wallet coin-selection variability
            .withOutputs(txObj.body.outputs)
            // .withVotes(txObj.body.voting_procedures ?? [])
            // .withInputs([...(txObj.body.inputs ?? []), ...extraInputRefs])
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

    // TODO: remove if only used once
    private encodeReferenceInputsConcat(inputs: any[]){
        const references = inputs.map((input: any) => ({transaction_id: input.transaction_id, output_index: BigInt(input.index)}))
        const bytes = references
            .map((ref) => {
                // raw 32-byte tx id
                const txId = fromHex(ref.transaction_id)
                // CBOR-encoded integer for index (to mirror on-chain serialise_data)
                const index = fromHex(Data.to(ref.output_index))
                const out = new Uint8Array(txId.length + index.length)
                out.set(txId, 0)
                out.set(index, txId.length)
                return out
            })
            .reduce((acc, cur) => {
                const out = new Uint8Array(acc.length + cur.length)
                out.set(acc, 0)
                out.set(cur, acc.length)
                return out
            }, new Uint8Array())
        return bytes
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
    withInputs(inputs: UTxO[]) {
        // Preserve the original input order as in the tx body to match on-chain behavior
        const ordered = inputs.map((input : UTxO) => ({
            transaction_id: input.txHash,
            output_index: BigInt(input.outputIndex)
        }))
        const encoded : string = Data.to(ordered, OutputReferenceList)
        this.inputs = fromHex(encoded)
        return this
    }

    withInputsFromBody(inputs: { transaction_id: string; index: number }[]) {
        const ordered = inputs.map((input) => ({
            transaction_id: input.transaction_id,
            output_index: BigInt(input.index),
        }))
        const encoded: string = Data.to(ordered, OutputReferenceList)
        this.inputs = fromHex(encoded)
        return this
    }

    // rework to use UTxOs
    withReferenceInputs(reference_inputs: any[]) {
        this.reference_inputs = this.encodeReferenceInputsConcat(reference_inputs)
        return this
    }
  
    /*
        Aiken definition of output
        Output {
            address: Address,
            value: Value,
            datum: Datum,
            reference_script: Option<ScriptHash>,
        }
    */
    withOutputs(outputs: any[]) {
        // console.log(`Outputs --> `, outputs)
        // const formated : any[] = outputs.map((output: any) => {
        const encoded : any = outputs.map((output: any) => {
            assert(1 === Object.keys(output).length, "Should only be one key on outputs root object")
            const a = output[Object.keys(output)[0]];
            // console.log("a is ", a)

            const addressDetails = getAddressDetails(a.address)
            // console.log(addressDetails)
            const processCredential = (credential: any ) => {
                if ("Key" === credential.type){
                    return {
                        VerificationKey: [credential.hash as string] as [string]
                    }
                }
                return {
                    Script: [credential.hash as string] as [string]
                } 
            }
            const processStakeCredential = (credential: any) => {
                if ("Key" === credential.type){
                    return {
                        Inline: [
                            {
                                VerificationKey: [credential.hash as string] as [string]
                            }
                        ] as [{ VerificationKey: [string]; } | { Script: [string]; }]
                    }
                }
                return {
                    Inline: [
                        {
                            Script: [credential.hash as string] as [string]
                        }
                    ] as [{ VerificationKey: [string]; } | { Script: [string]; }]
                } 
            }
            const address = {
                payment_credential: processCredential(addressDetails.paymentCredential),
                stake_credential: addressDetails.stakeCredential ? processStakeCredential(addressDetails.stakeCredential) : null 
            }

            // console.log(`STUB:withOutputs::outputs.map have address`)

            const value : Map<string, Map<string, bigint>> = new Map<string, Map<string, bigint>>();

            // add lovelace
            const lovelace = new Map<string, bigint>()
            lovelace.set("", BigInt(a.amount.coin))
            value.set("", lovelace)

            console.log("STUB: have set lovelace in value")

            // add everything else
            for (const policyId of Object.keys(a.amount.multiasset)) {
                // console.log(`%cpolicy id of assets is ${policyId}`, "color: red")
                const assets = new Map<string, bigint>();
                const tokens : any = a.amount.multiasset[policyId];
                for (const assetName of Object.keys(tokens)) {
                    console.log(`%cAsset name is ${assetName}`, "color: blue")
                    assets.set(assetName, BigInt(tokens[assetName]));
                }

                console.log("assets --> ", assets)
                // console.log("assets --> ", JSON.stringify(assets, null, 2))

                value.set(policyId, assets);
            }

            console.log("STUB:withOutputs --> have value")
            console.log(value)
            console.log(JSON.stringify(value, null, 2))

            // add datum (convert to one of three constructors)
            // start with InlineDatum because its all I ever use
            // const datum = a.datum_option
            const datum = a.datum_option ? {InlineDatum: a.datum_option.Datum.datum.bytes} : {NoDatum: "NoDatum"}

            // add reference script
            // get script hash / id
            const reference_script = (() => {
                if ([undefined, null].includes(a?.script_reference)) {
                    return null;
                }
                const key = Object.keys(a?.script_reference)[0]
                const script = a?.script_reference[key].script
                const validator : Validator = {
                    type: key as ScriptType,
                    script
                }
                const reference_script = a?.script_reference ?? null
                // console.log("reference script ", reference_script)
                const reference_script_hash = validatorToScriptHash(reference_script)
                // console.log("reference script hash ", reference_script_hash)
                return reference_script_hash
            })()

            const addressBytes = Data.to(address, Address)
            const valueBytes = Data.to(value, Value, {canonical: true})
            console.log("value bytes ", valueBytes)
            // const datumBytes = Data.to(datum, Datum)
            // const referenceScriptBytes = Data.to(reference_script, ScriptHash)
           
            const bytes = addressBytes + valueBytes

            return bytes
            // const wholeOutput = {
            //     address, 
            //     value,
            //     // datum,
            //     datum: { NoDatum: "NoDatum" as "NoDatum" },
            //     // reference_script,
            //     reference_script: null
            // }

            // const encodedOutput = Data.to<OutputType>(wholeOutput, OutputType)
            // console.log(`Encoded output is ${encodedOutput}`)
            // return encodedOutput
            // return wholeOutput
        })
        // .reduce((acc : Uint8Array, curr : string) => {
        //     const element = fromHex(curr)
        //     const bytes = new Uint8Array(acc.length + element.length)
        //     bytes.set(acc, 0)
        //     bytes.set(element, acc.length)
        //     return bytes
        // }, new Uint8Array())
        .reduce((acc, curr) => acc + curr, "")


        // const encoded = Data.to<OutputList>(formated, OutputList)
        console.log(`Encoded outputs: ${encoded}`)
        // TODO: process outputs before adding them to the builder
        // this.outputs = new Uint8Array()
        // show as hex
        this.outputs = fromHex(encoded)
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
        // going to change how I do this on chain this time
          const bytes = Object.keys(withdrawals)
             .map((key: string) => {
                const amount = BigInt(withdrawals[key])
                console.log("Amount: ", amount)

                const credential : Credential | undefined = getAddressDetails(key).stakeCredential 
                console.log("Credential: ", credential)
                assertExists(credential, "Stake credential must exist")
                const credential_bytes = Data.to({
                    VerificationKey: [credential.hash]
                }, CredentialType)
                console.log("Credential bytes: ", credential_bytes)
                const amount_bytes = Data.to(amount)

                const entry = new Uint8Array(fromHex(credential_bytes).length + fromHex(amount_bytes).length)
                entry.set(fromHex(credential_bytes), 0)
                entry.set(fromHex(amount_bytes), fromHex(credential_bytes).length)
                return entry
             })
             .reduce((acc, element) => {
                const new_acc = new Uint8Array(acc.length + element.length)
                new_acc.set(acc, 0)
                new_acc.set(element, acc.length)
                return new_acc
             }, new Uint8Array())
        this.withdrawals = bytes
        return this
    }

    withVotes(votes: any[]) {
        console.log("Votes: ", votes)
        this.votes = fromHex(Data.to(votes))
        return this
    }

    async build() : Promise<CustomTransactionId> {
        // todo: actually serialize the transaction builder 
        assertExists(this.mint, "Mint must be defined in the build step")
        // optional fields handled as None if missing to mirror on-chain attach behavior
        if (!this.treasury_donation) this.treasury_donation = fromHex(Data.to(new Constr(1, [])))
        if (!this.current_treasury_amount) this.current_treasury_amount = fromHex(Data.to(new Constr(1, [])))
        if (!this.reference_inputs) this.reference_inputs = fromHex(Data.to([]))
        if (!this.extra_signatories) this.extra_signatories = fromHex(Data.to([]))
        // Outputs intentionally excluded to avoid circularity between proto and final tx

        // Minimal MVP: hash only the mint field for now to validate end-to-end plumbing
        const components : Uint8Array[] = [
            this.mint,
        ]

        const combinedLengthUpTo = (n: number) => components.slice(0, n).reduce((acc : number, el: Uint8Array) => acc + el.length, 0 )
        const fullLength = combinedLengthUpTo(components.length)
        
        const blob = new Uint8Array(fullLength)
        for (let i = 0; i < components.length; i++) {
            blob.set(components[i], i === 0 ? 0 : combinedLengthUpTo(i))
        }
        return await sha256(blob)
    }
}
