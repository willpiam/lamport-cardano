import { Assets, Data, getAddressDetails, UTxO } from "npm:@lucid-evolution/lucid";
import { Address, Credential, Datum, Input, Output, OutputReference, StakeCredential, Value } from "./datatypes/index.ts";

/*
    Sources: 
        https://github.com/leobel/janus-wallet/blob/bdc66afe2e1bc2f13ee4873c5c03232d5e02327c/src/utils/prepare-contracts.ts
*/

function getAddress(addr: string): Address {
    console.log("inside getAddress")
    console.log(addr)
    const addressInfo = getAddressDetails(addr);
    const paymentHash = addressInfo.paymentCredential!.hash;
    const paymentType = addressInfo.paymentCredential?.type;
    const stakeHash = addressInfo.stakeCredential?.hash;
    const stakeType = addressInfo.stakeCredential?.type;
    const paymentCredential: Credential = paymentType == "Key" ?
        { VerificationKey: [paymentHash] } : { Script: [paymentHash] };
    const stakeCredential: StakeCredential | null = addressInfo.stakeCredential ? stakeType == "Key" ?
        { Inline: [{ VerificationKey: [stakeHash!] }] } : { Inline: [{ Script: [stakeHash!] }] } : null;
    const address: Address = {
        payment_credential: paymentCredential,
        stake_credential: stakeCredential
    };
    return address;
}


function getDatum(dataHash?: string | null, data?: string | null): Datum {
    if (dataHash) {
        return { DatumHash: [dataHash] };
    } else if (data) {
        const datum = Data.from(data);
        return { InlineDatum: [datum] }
    } else {
        return { NoDatum: "NoDatum" }
    }
}

function getValue(assets: Assets): Value {
    const value = new Map<string, Map<string, bigint>>();

    for (const [k, v] of Object.entries(assets)) {
        const [policyId, assetName] = k == "lovelace" ? ["", ""] : [k.slice(0, 56), k.slice(56)];
        if (!value.has(policyId)) {
            value.set(policyId, new Map<string, bigint>());
        }
        const assetMap = value.get(policyId)!;
        if (!assetMap.has(assetName)) {
            assetMap.set(assetName, v);
        } else {
            const currentValue = assetMap.get(assetName)!;
            assetMap.set(assetName, currentValue + v);
        }
    }
    const serialise = Data.to(value, Value, { canonical: true });

    return Data.from(serialise, Value);
}

export function getInput(utxo: UTxO): Input {
    console.log("inside getInput")
    console.log(utxo)
    const outputReference: OutputReference = {
        // transaction_id: utxo.transaction_id,
        transaction_id: utxo.txHash,
        output_index: BigInt(utxo.outputIndex)
    };

    const address = getAddress(utxo.address);
    const value = getValue(utxo.assets);
    const datum = getDatum(utxo.datumHash, utxo.datum);
    const referenceScript = utxo.scriptRef?.script || null;
    const output: Output = {
        address: address,
        value: value,
        datum: datum,
        reference_script: referenceScript
    };

    // const input = Data.to({
    //     output_reference: outputReference,
    //     output: output
    // }, Input)
    const input: Input = {
        output_reference: outputReference,
        output: output
    }
    return input;
}