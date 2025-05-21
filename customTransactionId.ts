

/*
    Off-chain version of the logic for the `custom_transaction_id` as defined in 
    /lamport-cardano/lamport-validator/lib/custom_transaction_id.ak

*/

import { sha256 } from "./sha256.ts";


// type CustomTransactionIdBuilder = Partial<{
//     inputs: Uint8Array,
//     reference_inputs: Uint8Array,
//     outputs: Uint8Array,
//     fee: Uint8Array,
//     mint: Uint8Array,
//     certificates: Uint8Array,
//     withdrawals: Uint8Array,
//     extra_signatories: Uint8Array,
//     redeemers: Uint8Array,
//     datums: Uint8Array,
//     votes: Uint8Array,
//     proposal_procedures: Uint8Array,
//     current_treasury_amount: Uint8Array,
//     treasury_donation: Uint8Array,
// }>

export type CustomTransactionId = Uint8Array

// const newCustomTransactionId = () : CustomTransactionIdBuilder => {
//     return {}
// }

// const withInputs = (builder: CustomTransactionIdBuilder, inputs : any[]) : CustomTransactionIdBuilder => {
//     return {
//         ...builder,
//         // inputs:
//     }
// }

// const buildCustomTransactionId = async (builder: CustomTransactionIdBuilder) : CustomTransactionId => {
//     // serialized
//     const serialized = new Uint8Array()

//     // hashed
//     return await sha256(serialized)
// }

export class CustomTransactionIdBuilder {
    private inputs: Uint8Array | undefined
    private reference_inputs: Uint8Array | undefined
    private outputs: Uint8Array | undefined
    private fee: Uint8Array | undefined
    private mint: Uint8Array | undefined
    private certificates: Uint8Array | undefined
    private withdrawals: Uint8Array | undefined
    private extra_signatories: Uint8Array | undefined
    private redeemers: Uint8Array | undefined
    private datums: Uint8Array | undefined
    private votes: Uint8Array | undefined
    private proposal_procedures: Uint8Array | undefined
    private current_treasury_amount: Uint8Array | undefined
    private treasury_donation: Uint8Array | undefined

    constructor() {}

    withInputs(inputs: any[]) {
        // TODO: process inputs before adding them to the builder
        this.inputs = new Uint8Array()
        return this
    }

    async build() : Promise<CustomTransactionId> {
        // todo: actually serialize the transaction builder 
        const serialized = new Uint8Array()
        return await sha256(serialized)
    }
}

// export const customTransactionId = async (tx: Transaction) : Promise<CustomTransactionId> => {
//     const builder = newCustomTransactionId()
//     return await buildCustomTransactionId(builder)
// }

