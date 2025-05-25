import { assertExists } from "@std/assert/exists";
import { CustomTransactionIdBuilder, CustomTransactionId } from "./customTransactionId.ts";
import {
  applyParamsToScript,
  Constr,
  Data,
  Emulator,
  fromText,
  generateEmulatorAccount,
  getAddressDetails,
  Lucid,
  mintingPolicyToId,
  paymentCredentialOf,
  scriptFromNative,
  SpendingValidator,
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

Deno.test("Custom Transaction Id - build from a simple transaction", async (t) => {
    const tx = await lucid.newTx()
        .pay.ToAddress(await lucid.wallet().address(), {
            lovelace: 1_000_000n,
        })
        .complete()

    const txObj : any = tx.toJSON()
    console.log(txObj)

    const customTransactionIdBuilder = new CustomTransactionIdBuilder()
        .withInputs(txObj.body.inputs)
        .withReferenceInputs(txObj.body.reference_inputs)
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
    console.log(`%cAbout to create dummy transaction`, "color: yellow")
    const dummyTx = await lucid.newTx().complete()
    const dummyTxObj : any = dummyTx.toJSON()

    console.log("dummyTxObj.body.reference_inputs", dummyTxObj.body.reference_inputs)

    // const customTransactionIdBuilder = new CustomTransactionIdBuilder()
    //     // .withInputs(dummyTxObj.body.inputs)
    //     .withReferenceInputs(dummyTxObj.body.reference_inputs)
    //     // .withOutputs(txObj.body.outputs)
    //     // .withFee(txObj.body.fee)
    
    // const message = await customTransactionIdBuilder.build()
    const message = await sha256(new Uint8Array([1]))
    console.log(`Message: ${toHex(message)}`)

    const tx = await lucid.newTx()
        .collectFrom(await lucid.utxosAt(scriptAddress), SpendAction.VerifyFullSignature(message))
        .attach.SpendingValidator(validator)
        .complete()

    const signed = await tx.sign.withWallet().complete()
    const txHash = await signed.submit()
    await lucid.awaitTx(txHash)
    
    const utxos = await lucid.utxosAt(scriptAddress)
    assert(utxos.length === 0, "expected 0 utxos in the validator")

});


