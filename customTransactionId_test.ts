import { assertExists } from "@std/assert/exists";
import { CustomTransactionIdBuilder, CustomTransactionId } from "./customTransactionId.ts";
import {
  applyParamsToScript,
  Constr,
  Data,
  Emulator,
  fromHex,
  fromText,
  generateEmulatorAccount,
  getAddressDetails,
  Lucid,
  mintingPolicyToId,
  paymentCredentialOf,
  scriptFromNative,
  SpendingValidator,
  unixTimeToSlot,
  validatorToAddress,
} from "npm:@lucid-evolution/lucid";
import blueprint from "./lamport-validator/plutus.json" with { type: "json" };
import { assert } from "node:console";
import { SpendAction } from "./mirror-types.ts";
import { sha256 } from "./sha256.ts";
import { toHex } from "npm:@blaze-cardano/core";

const alice = generateEmulatorAccount({
  lovelace: 100_000_000n, // 100 ada
});

const emulator = new Emulator([alice]);
const lucid = await Lucid(emulator, "Custom");
lucid.selectWallet.fromSeed(alice.seedPhrase);


// export const ValueSchema = Data.Map(
//   Data.Bytes(),
//   Data.Map(Data.Bytes(), Data.Bytes())
// );
// export type Value = Data.Static<typeof ValueSchema>;
// export const Value = ValueSchema as unknown as Value;

const simpleMintingPolicy = scriptFromNative({
    type: "all",
    scripts: [
        // { type: "sig", keyHash: paymentCredentialOf(await lucid.wallet().address()).hash },
    ],
});
const simplePolicyId = mintingPolicyToId(simpleMintingPolicy);

Deno.test("Custom Transaction Id - build from a simple transaction", async (t) => {
    const tx = await lucid.newTx()
        .mintAssets({
            [simplePolicyId + fromText("MyToken")]: 1n,
        })
        .attach.MintingPolicy(simpleMintingPolicy)
        .pay.ToAddress(await lucid.wallet().address(), {
            lovelace: 1_000_000n,
        })
        .complete()

    const txObj : any = tx.toJSON()

    const customTransactionIdBuilder = new CustomTransactionIdBuilder()
        // .withInputs(txObj.body.inputs)
        // .withReferenceInputs(txObj.body.reference_inputs)
        .withMint(txObj.body.mint)
        // .withOutputs(txObj.body.outputs)
        // .withFee(txObj.body.fee)

    const customTransactionId = await customTransactionIdBuilder.build()
    console.log(customTransactionId)
});

Deno.test("Custom Transaction Id - spend from custom_transaction_id_minimal", async (t) => {
    // lock a utxo in the validator
    assert(blueprint.validators.map(v => v.title).includes("custom_transaction_id_minimal.custom_transaction_id_minimal.spend"), "custom_transaction_id_minimal validator not found");
    const rawValidator = blueprint.validators.find((v) => v.title === "custom_transaction_id_minimal.custom_transaction_id_minimal.spend")!.compiledCode;

    const parameterizedValidator = applyParamsToScript(rawValidator, []);

    const validator: SpendingValidator = {
        type: "PlutusV3",
        script: parameterizedValidator,
    };
    const scriptAddress = validatorToAddress(
        "Custom",
        validator,
        getAddressDetails(await lucid.wallet().address()).stakeCredential,
    );
    console.log(scriptAddress)

    // step: lock 5 ada in the validator
    await t.step("lock 5 ada in the validator", async () => {
        const tx = await lucid.newTx()
            .pay.ToContract(scriptAddress, { kind: "inline", value: Data.void()}, {
                lovelace: 5_000_000n,
            })
            .complete()

        const signed = await tx.sign.withWallet().complete()
        const txHash = await signed.submit()
        await lucid.awaitTx(txHash)
        const utxos = await lucid.utxosAt(scriptAddress)
        assert(utxos.length === 1, "expected 1 utxo in the validator")
        console.log("%clocked 5 ada in the validator", "color: yellow")
    })

    // step 1: build the transaction
    // this may involve placing a dummy 32 bytes value in the redeemer to
    // ensure the fee is calculated correctly
    // to start we will assert only that the transaction must mint the same
    // values as the dummy transaction
    // add a very simple policy to mint a token

    const dummyTx = await lucid
        .newTx()
        .mintAssets({
            [simplePolicyId + fromText("MyToken")]: 1n,
        })
        .attach.MintingPolicy(simpleMintingPolicy)
        .complete();
    const dummyTxObj : any = dummyTx.toJSON()

    console.log("%cdummyTxObj.body.mint", "color: orange",dummyTxObj.body.mint)

    const mintObj = Object.keys(dummyTxObj.body.mint)
        .reduce((acc, key) => {
            acc.set(key, new Map(Object.entries(dummyTxObj.body.mint[key]).map(([k, v] : [string, any]) => [k, BigInt(v)])))
            return acc
        }, new Map<string, Map<string, bigint>>())
    console.log("%cmintObj", "color: orange", mintObj)
    // assert that the only key is the policy id
    assert(mintObj.keys().toArray().includes(simplePolicyId), "mintOnj must include simple policy id")
    // assert its the only key
    assert(mintObj.size === 1, "mintObj must have only one key")
    // assert that the value is a map with one entry
    assert(mintObj.get(simplePolicyId)?.size === 1, "mintObj must have only one map with only one value")
    // assert that the only key in the second layer map is the token name
    assert(mintObj.get(simplePolicyId)?.keys().toArray().includes(fromText("MyToken")), "mintObj must have only one map with only one value")
    console.log("STUB ".repeat(10))

    const ValueSchema = Data.Map(
        Data.Bytes(), 
        Data.Map(
            Data.Bytes(), 
            Data.Integer()
        )
    )
    type Value = Data.Static<typeof ValueSchema>;
    const Value = ValueSchema as unknown as Value;

    const preimage = Data.to<Value>(mintObj, Value)
    
    console.log("%cpreimage", "color: orange", preimage)
    const message = await sha256(fromHex(preimage))
    // const message = await sha256(preimage)

    console.log(`%cmessage ${toHex(message)}`, "color: hotpink")
    console.log("simplePolicyId", fromHex(simplePolicyId))
    console.log("asset name", fromHex(fromText("MyToken")))

    const tx = await lucid.newTx()
        .collectFrom(await lucid.utxosAt(scriptAddress), SpendAction.VerifyFullSignature(message))
        .attach.SpendingValidator(validator)
        .mintAssets({
            [simplePolicyId + fromText("MyToken")]: 1n,
        })
        .attach.MintingPolicy(simpleMintingPolicy)
        .complete()
    
    console.log("%cpassed complete ", "color: hotpink")

    console.log("%chave real transaction", "color: yellow")
    const txObj : any = tx.toJSON()
    assert(txObj.body.mint === dummyTxObj.body.mint, "mint must be the same on dummy and real transactions")

    const signed = await tx.sign.withWallet().complete()
    const txHash = await signed.submit()
    await lucid.awaitTx(txHash)
    
    const utxos = await lucid.utxosAt(scriptAddress)
    assert(utxos.length === 0, "expected 0 utxos in the validator")
});


