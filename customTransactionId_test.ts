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
import { toHex } from "npm:@blaze-cardano/core";

const alice = generateEmulatorAccount({
  lovelace: 100_000_000n, // 100 ada
});

const emulator = new Emulator([alice]);
const lucid = await Lucid(emulator, "Custom");
lucid.selectWallet.fromSeed(alice.seedPhrase);

const simpleMintingPolicy = scriptFromNative({
    type: "all",
    scripts: [],
});
const simplePolicyId = mintingPolicyToId(simpleMintingPolicy);

Deno.test("Custom Transaction Id - build from a simple transaction", async (t) => {
    const validFrom = emulator.now();
    const validTo = validFrom + 900000;
    const tx = await lucid.newTx()
        .mintAssets({
            [simplePolicyId + fromText("MyToken")]: 1n,
        })
        .attach.MintingPolicy(simpleMintingPolicy)
        .pay.ToAddress(await lucid.wallet().address(), {
            lovelace: 1_000_000n,
        })
        .validFrom(validFrom)
        .validTo(validTo)
        .complete()

    const customTransactionId = await CustomTransactionIdBuilder.customTransactionId(tx)
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

    const validFrom = emulator.now();
    const validTo = validFrom + 900000;

    const dummyTx = await lucid
        .newTx()
        .mintAssets({
            [simplePolicyId + fromText("MyToken")]: 1n,
        })
        .attach.MintingPolicy(simpleMintingPolicy)
        .validFrom(validFrom)
        .validTo(validTo)
        .complete();

    const message = await CustomTransactionIdBuilder.customTransactionId(dummyTx)
    console.log(`%cmessage  ${toHex(message)}`, "color: hotpink")

    const tx = await lucid.newTx()
        .collectFrom(await lucid.utxosAt(scriptAddress), SpendAction.VerifyFullSignature(message))
        .attach.SpendingValidator(validator)
        .mintAssets({
            [simplePolicyId + fromText("MyToken")]: 1n,
        })
        .attach.MintingPolicy(simpleMintingPolicy)
        .validFrom(validFrom)
        .validTo(validTo)
        .complete()
    
    console.log("%cpassed complete ", "color: hotpink")

    console.log("%chave real transaction", "color: yellow")
    assert((tx.toJSON() as any).body.mint.toString() === (dummyTx.toJSON() as any).body.mint.toString(), "mint must be the same on dummy and real transactions")

    // console.log(tx.toJSON())
    // TODO: assert the dummy tx and real tx have the exact same validity range
    assert((tx.toJSON() as any).body.ttl === (dummyTx.toJSON() as any).body.ttl, "ttl must be the same on dummy and real transactions")
    assert((tx.toJSON() as any).body.validity_interval_start === (dummyTx.toJSON() as any).body.validity_interval_start, "validity interval start must be the same on dummy and real transactions")

    const signed = await tx.sign.withWallet().complete()
    const txHash = await signed.submit()
    await lucid.awaitTx(txHash)
    
    const utxos = await lucid.utxosAt(scriptAddress)
    assert(utxos.length === 0, "expected 0 utxos in the validator")
});


// off chain then on chain versions of blob
/// a1581cd441227553a0f1a965fee7d60a0f724b368dd1bddbc208730fccebcfa1474d79546f6b656e01d8799fd8799fd87a9f1 4ffd87a80ffd8799fd87a9f190398                             ffd87 a 80ffff
/// A1581CD441227553A0F1A965FEE7D60A0F724B368DD1BDDBC208730FCCEBCFA1474D79546F6B656E01D8799FD8799FD87A9F1 B0000019746ED03DDFFD87A80FFD8799FD87A9F1B0000019746FABF7D FFD87 9 80FFFF