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

    const customTransactionId = await CustomTransactionIdBuilder.customTransactionId(tx, lucid)
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

    const referenceInputHolder = generateEmulatorAccount({});
    // step: create a reference input
    await t.step("create a reference input", async () => {
        const tx = await lucid.newTx()
            .pay.ToContract(referenceInputHolder.address, { kind: "inline", value: Data.to(fromText("This will be a reference input"))}, {
                lovelace: 5_000_000n,
            })
            .complete()
        
        const signed = await tx.sign.withWallet().complete()
        const txHash = await signed.submit()
        await lucid.awaitTx(txHash)
    });

    // find the reference input
    const referenceInput = await (async () => {
        const utxos = await lucid.utxosAt(referenceInputHolder.address)
        assert(utxos.length === 1, "expected 1 utxo in the reference input holder")
        return utxos[0]
    })()

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
        .readFrom([referenceInput])
        .complete();

    const message = await CustomTransactionIdBuilder.customTransactionId(dummyTx, lucid)
    console.log(`%cmessage  ${toHex(message)}`, "color: hotpink")
    // save dummy tx to dummytx.json
    Deno.writeTextFileSync("dummytx.json", JSON.stringify(dummyTx.toJSON(), null, 2))

    const tx = await lucid.newTx()
        .collectFrom(await lucid.utxosAt(scriptAddress), SpendAction.VerifyFullSignature(message))
        .attach.SpendingValidator(validator)
        .mintAssets({
            [simplePolicyId + fromText("MyToken")]: 1n,
        })
        .attach.MintingPolicy(simpleMintingPolicy)
        .validFrom(validFrom)
        .validTo(validTo)
        .readFrom([referenceInput])
        .complete()
    
    console.log("%cpassed complete ", "color: hotpink")

    console.log("%chave real transaction", "color: yellow")
    assert((tx.toJSON() as any).body.mint.toString() === (dummyTx.toJSON() as any).body.mint.toString(), "mint must be the same on dummy and real transactions")

    // console.log(tx.toJSON())
    // TODO: assert the dummy tx and real tx have the exact same validity range
    assert((tx.toJSON() as any).body.ttl === (dummyTx.toJSON() as any).body.ttl, "ttl must be the same on dummy and real transactions")
    assert((tx.toJSON() as any).body.validity_interval_start === (dummyTx.toJSON() as any).body.validity_interval_start, "validity interval start must be the same on dummy and real transactions")
    
    // TODO: assert they have the same reference inputs
    
    const signed = await tx.sign.withWallet().complete()
    const txHash = await signed.submit()
    await lucid.awaitTx(txHash)
    
    const utxos = await lucid.utxosAt(scriptAddress)
    assert(utxos.length === 0, "expected 0 utxos in the validator")
});


/// on-chain v off-chain blobs
//  A1581CD441227553A0F1A965FEE7D60A0F724B368DD1BDDBC208730FCCEBCFA1474D79546F6B656E01D87A80D87A809FD8799FD8799F582078A8B9A34F76593CC7249B2276AEA8FE7592C01986923D932E031AE65F0C707B00FFD8799FD8799FD8799F581CF9C89917ECF4871CB4CE26CCC505C52D5A9641F32A95CE6B47E73C3DFFD8799FD8799FD8799F581C9145A9C148EAD4C448E236F5094896BC842CA3EFE689BACB3E2B5B31FFFFFFFF A140A1 401A004C4B40     D87B9F581E546869732077696C6C2062652061207265666572656E636520696E707574FFD87A80FFFFFF
//  a1581cd441227553a0f1a965fee7d60a0f724b368dd1bddbc208730fccebcfa1474d79546f6b656e01d87a80d87a809fd8799fd8799f582078a8b9a34f76593cc7249b2276aea8fe7592c01986923d932e031ae65f0c707b00ffd8799fd8799fd8799f581cf9c89917ecf4871cb4ce26ccc505c52d5a9641f32a95ce6b47e73c3dffd8799fd8799fd8799f581c9145a9c148ead4c448e236f5094896bc842ca3efe689bacb3e2b5b31ffffffff bf40bf 401a004c4b40 ffffd87b9f581e546869732077696c6c2062652061207265666572656e636520696e707574ffd87a80ffffff
//  turn canonical on
//  a1581cd441227553a0f1a965fee7d60a0f724b368dd1bddbc208730fccebcfa1474d79546f6b656e01d87a80d87a8081d87982d879 825820821ffc489a1ce36f88f0aab00159724a624ba2eafbe0055a4b0bb9b1288f23a100d87984d87982d87981581cc871c5b9908ed8cd0a108524dee93bf6fe599b7d3ecb9c624e07e2d8d87981d87981d87981581c42251fe9aa939c95758b16e246ab5f066ab6e7fd26f14cb784ea2174a140a1401a004c4b40d87b81                  581e546869732077696c6c2062652061207265666572656e636520696e707574  d87a80