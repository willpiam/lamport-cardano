import { assertExists } from "@std/assert/exists";
import { CustomTransactionIdBuilder, CustomTransactionId } from "./customTransactionId.ts";
import {
Anchor,
  applyParamsToScript,
  Constr,
  Data,
  Delegation,
  Emulator,
  fromHex,
  fromText,
  generateEmulatorAccount,
  getAddressDetails,
  Lucid,
  mintingPolicyToId,
  paymentCredentialOf,
  PoolId,
  scriptFromNative,
  SpendingValidator,
  stakeCredentialOf,
  unixTimeToSlot,
  UTxO,
  validatorToAddress,
  walletFromSeed,
} from "npm:@lucid-evolution/lucid@0.4.29";
import blueprint from "./lamport-validator/plutus.json" with { type: "json" };
import { assert } from "node:console";
import { SpendAction } from "./mirror-types.ts";
import { toHex } from "npm:@blaze-cardano/core";

const alice = generateEmulatorAccount({
  lovelace: 700_000_000_000n, // 500 + 100 ada
});

const emulator = new Emulator([alice]);
const lucid = await Lucid(emulator, "Custom");
lucid.selectWallet.fromSeed(alice.seedPhrase);

const simpleMintingPolicy = scriptFromNative({
    type: "all",
    scripts: [],
});
const simplePolicyId = mintingPolicyToId(simpleMintingPolicy);

const stakeAddress = await lucid.wallet().rewardAddress()
assertExists(stakeAddress)

Deno.test.ignore("Custom Transaction Id - build from a simple transaction", async (t) => {
    const validFrom = emulator.now();
    const validTo = validFrom + 900000;

    const chuck = generateEmulatorAccount({});
    console.log('alice address ' + alice.address)
    console.log(alice)

    const additionalSigners : string[] = [chuck.address].map(
        address => stakeCredentialOf(address).hash
    )

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
        .addSignerKey(additionalSigners[0])
        .complete()

    const customTransactionId = await CustomTransactionIdBuilder.customTransactionId(tx, lucid, additionalSigners)
    console.log(customTransactionId)
});

Deno.test("Custom Transaction Id - spend from custom_transaction_id_minimal", async (t) => {
    // step: setup for withdrawal  
    await t.step("register stake", async () => {
        const tx = await lucid.newTx()
            .register.Stake(stakeAddress)
            .complete()

        const signed = await tx.sign.withWallet().complete()
        const txHash = await signed.submit()
        await lucid.awaitTx(txHash)
    });

    // show current rewards amount
    const showRewards = async () => {
        const {rewards} : Delegation = await lucid.delegationAt(stakeAddress)
        console.log(`%cCurrent rewards amount: ${rewards}`, "color: hotpink")
    }
    await showRewards()

    await t.step("delegate to pool", async () => {
        // get a valid pool id
        const poolId : PoolId = "pool1eqj3dzpkcklc2r0v8pt8adrhrshq8m4zsev072ga7a52uj5wv5c"
        const tx = await lucid.newTx()
            .delegate.ToPool(stakeAddress, poolId)
            .complete()

        const signed = await tx.sign.withWallet().complete()
        const txHash = await signed.submit()
        await lucid.awaitTx(txHash)
    });

    await showRewards()
    emulator.distributeRewards(100_000_000n)
    await showRewards()

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

    const referenceInputPointerAssetName = fromText("Pointer To Reference Input");

    await t.step("Mint a token to lock in the reference input so we can see what happens to the map(1) bug when we add another token", async() => {
        const tx = await lucid.newTx()
            .mintAssets({
                [simplePolicyId + referenceInputPointerAssetName]: 1n,
            })
            .attach.MintingPolicy(simpleMintingPolicy)
            .complete()

        const signed = await tx.sign.withWallet().complete()
        const txHash = await signed.submit()
        await lucid.awaitTx(txHash)

        assert((await lucid.utxoByUnit(simplePolicyId + referenceInputPointerAssetName)).address === await lucid.wallet().address(), "token must be in wallet at this point")
    })

    // step: lock 5 ada in the validator
    await t.step("lock 5 ada and the in the validator * create new utxos for self", async () => {
        const tx = await lucid.newTx()
            .pay.ToContract(scriptAddress, { kind: "inline", value: Data.void()}, {
                lovelace: 5_000_000n,
            })
            .pay.ToAddress(await lucid.wallet().address(), {
                lovelace: 500_000_000n,
            })
            .pay.ToAddress(await lucid.wallet().address(), {
                lovelace: 700_000_000n,
            })
            .pay.ToAddress(await lucid.wallet().address(), {
                lovelace: 700_000_000n,
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
                [simplePolicyId + referenceInputPointerAssetName] : 1n
            })
            .complete()
        
        const signed = await tx.sign.withWallet().complete()
        const txHash = await signed.submit()
        await lucid.awaitTx(txHash)
    });

    console.log("STUB: created reference input")
    // find the reference input
    const referenceInput : UTxO = await (async () => {
        const utxos = await lucid.utxosAt(referenceInputHolder.address)
        assert(utxos.length === 1, "expected 1 utxo in the reference input holder")
        return utxos[0]
    })()
    console.log("STUB: found reference input")

    const validFrom = emulator.now();
    const validTo = validFrom + 900000;

    const getRewards  = async () => {
        const {rewards} : Delegation = await lucid.delegationAt(stakeAddress)
        return rewards
    }

    const withdrawAmount = await getRewards()

    const dummyTx = await lucid
        .newTx()
        .mintAssets({
            [simplePolicyId + fromText("MyToken")]: 1n,
        })
        .attach.MintingPolicy(simpleMintingPolicy)
        .validFrom(validFrom)
        .validTo(validTo)
        .readFrom([referenceInput])
        .withdraw(stakeAddress, withdrawAmount)
        // .register.DRep(stakeAddress)
        .complete();

    const message = await CustomTransactionIdBuilder.customTransactionId(dummyTx, lucid)
    console.log(`%cmessage  ${toHex(message)}`, "color: hotpink")
    // save dummy tx to dummytx.json
    Deno.writeTextFileSync("dummytx.json", JSON.stringify(dummyTx.toJSON(), null, 2))
    console.log("STUB: saved dummy tx")

    const scriptUtxos = await lucid.utxosAt(scriptAddress)
    console.log(`${scriptUtxos.length} utxos in the validator`)
    assert(scriptUtxos.length === 1, "expected 1 utxo in the validator")

    const tx = await lucid.newTx()
        .collectFrom(scriptUtxos, SpendAction.VerifyFullSignature(message))
        .attach.SpendingValidator(validator)
        .mintAssets({
            [simplePolicyId + fromText("MyToken")]: 1n,
        })
        .attach.MintingPolicy(simpleMintingPolicy)
        .validFrom(validFrom)
        .validTo(validTo)
        .readFrom([referenceInput])
        // .register.DRep(stakeAddress)
        .withdraw(stakeAddress, withdrawAmount)
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

    await showRewards()
    // assert the rewards amount is 0
    assert(await getRewards() === 0n, "rewards amount must be 0")
});

// datum --> 546869732077696c6c2062652061207265666572656e636520696e707574 = Hex("This will be a reference input")
// value --> a140a1401a004c4b40 Now this is actually a substring of the onchain bytes but it was found by console.loging the serialised value in utils.ts::getValue
// chances are the problem is how we serialize the Values within the reference inputs. 
/// on-chain vs. off-chain reference inputs bytes
// 9FD8799FD8799F582077DF2BE1797CC094D2BFC911B8548E259D31F1AA19C803636F0C60F9F82ECB5D00FFD8799FD8799FD8799F581CC4EB22307F02FF142745868F8BB346371685F9062B7B29EE95E8083CFFD8799FD8799FD8799F581CB0A29CADBC43A7FCD8F3042BCD07052CCEA200F951D83F25CBEF6791FFFFFFFF A140A1_401A004C4B40       D87B9F581E|546869732077696C6C2062652061207265666572656E636520696E707574|FFD87A80FFFFFF
// 9fd8799fd8799f582077df2be1797cc094d2bfc911b8548e259d31f1aa19c803636f0c60f9f82ecb5d00ffd8799fd8799fd8799f581cc4eb22307f02ff142745868f8bb346371685f9062b7b29ee95e8083cffd8799fd8799fd8799f581cb0a29cadbc43a7fcd8f3042bcd07052ccea200f951d83f25cbef6791ffffffff bf40bf 401a004c4b40 ffff  d87b9f581e|546869732077696c6c2062652061207265666572656e636520696e707574|ffd87a80ffffff

// with canonical true
// on-chain then off-chain
// 9FD8799FD8799F5820E52690E7749CDD91A2CEC9E2EC5F37EE9EC5AD1EE318206ABF90B29747827F3200 FFD879 9F D879 9F D879 9F 581C3D7EB358E8C283633FE15C3827CC65A1248116DFF53A6BA15D007BC0 FFD8799FD8799FD8799F581C24AFD3A944B016233BE879D611898D9D10A0E06DB72CDF1A1F1C6698FFFFFFFF A140A1401A004C4B40D87B 9F 581E546869732077696C6C2062652061207265666572656E636520696E707574FFD87A80FFFFFF
// 81d87982d879825820e52690e7749cdd91a2cec9e2ec5f37ee9ec5ad1ee318206abf90b29747827f3200   d879 84 d879 82 d879 81 581c3d7eb358e8c283633fe15c3827cc65a1248116dff53a6ba15d007bc0   d87981d87981d87981581c24afd3a944b016233be879d611898d9d10a0e06db72cdf1a1f1c6698a140             a1401a004c4b40d87b 81 581e546869732077696c6c2062652061207265666572656e636520696e707574  d87a80

// conclusion:
// It looks like Value and nothing else should be set as canonical in the list of reference inputs