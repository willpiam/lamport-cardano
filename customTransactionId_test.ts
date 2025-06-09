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


/// on-chain vs. off-chain blobs vs. off chain with getVals canonical unset vs. both canonical on
//  A1581CD441227553A0F1A965FEE7D60A0F724B368DD1BDDBC208730FCCEBCFA1474D79546F6B656E01D87A80D87A809FD87 99FD879 9F5820 78A8B9A34F76593CC7249B2276AEA8FE7592C01986923D932E031AE65F0C707B 00FFD8799FD8799FD8799F581C F9C89917ECF4871CB4CE26CCC505C52D5A9641F32A95CE6B47E73C3 DFFD8799FD8799FD8799F581C 9145A9C148EAD4C448E236F5094896BC842CA3EFE689BACB3E2B5B31FFFFFFFF    A140A1 401A004C4B40      D87B9F581E546869732077696C6C2062652061207265666572656E636520696E707574FFD87A80FFFFFF
//  a1581cd441227553a0f1a965fee7d60a0f724b368dd1bddbc208730fccebcfa1474d79546f6b656e01d87a80d87a809fd879 9fd879 9f5820 78a8b9a34f76593cc7249b2276aea8fe7592c01986923d932e031ae65f0c707b 00ffd8799fd8799fd8799f581c f9c89917ecf4871cb4ce26ccc505c52d5a9641f32a95ce6b47e73c3 dffd8799fd8799fd8799f581c 9145a9c148ead4c448e236f5094896bc842ca3efe689bacb3e2b5b31ffffffff    bf40bf 401a004c4b40 ffff d87b9f581e546869732077696c6c2062652061207265666572656e636520696e707574ffd87a80ffffff
//  a1581cd441227553a0f1a965fee7d60a0f724b368dd1bddbc208730fccebcfa1474d79546f6b656e01d87a80d87a809fd879 9fd879 9f5820 dc9bbbf5ed007aad11caedc288323df899a1df2d9f76b3db2f05ce587cbf6831 00ffd8799fd8799fd8799f581c 8663a7c89591a60d19c531db662d843eb9b4a36362f9fff8974712c dffd8799fd8799fd8799f581c abf6ba7e948817703c1aac26f583b8916707c1b8ce3f3d0d146f  31ffffffff ff bf40bf 401a004c4b40 ffff d87b9f581e546869732077696c6c2062652061207265666572656e636520696e707574ffd87a80ffffff 
//  a1581cd441227553a0f1a965fee7d60a0f724b368dd1bddbc208730fccebcfa1474d79546f6b656e01d87a80d87a8081d879 82d879 8258202e408571ec2b551fbc48047bef5ba710d157249c05e80ca929a88c23cbe681d800d87984d87982d87981581c3484d18e7c09d75556ef4aa0ad7b9696ab61ce26a7253722460263e7d87981d87981d87981581c23bbcc63e2c19eed3783e9621000159499b2e02f53a7962183926382a140a1401a004c4b40d87b81581e546869732077696c6c2062652061207265666572656e636520696e707574d87a80
