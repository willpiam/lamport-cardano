import { applyParamsToScript, Data, Emulator, fromText, generateEmulatorAccount, getAddressDetails, Lucid, MintingPolicy, mintingPolicyToId, paymentCredentialOf, scriptFromNative, SpendingValidator, validatorToAddress } from "npm:@lucid-evolution/lucid";
import blueprint from "./lamport-validator/plutus.json" with { type: "json" };
import {
  assertEquals,
  assert,
  assertExists,
  assertRejects,
} from "@std/assert";

// Setup test accounts
const alice = generateEmulatorAccount({
  lovelace: 100_000_000n, // 100 ada
});

const emulator = new Emulator([alice]);
const lucid = await Lucid(emulator, "Custom");
lucid.selectWallet.fromSeed(alice.seedPhrase);
const aliceAddress = await lucid.wallet().address();

const rawValidator = blueprint.validators.find(v => v.title === "manystep.manysteplamport.spend")!.compiledCode;
const parameterizedValidator = applyParamsToScript(rawValidator, [0n]);

const mintingPolicy : MintingPolicy = {
    type: "PlutusV3",
    script: parameterizedValidator
}
const policyId = mintingPolicyToId(mintingPolicy);
const units = Array.from({length: 8}, (_, i) => policyId + fromText(`${i + 1}`));
const assetsToMint = units.reduce((acc, unit) => ({...acc, [unit]: 1n}), {});

const validator : SpendingValidator = {
    type: "PlutusV3",
    script: parameterizedValidator
}
const scriptAddress = validatorToAddress("Custom", validator, getAddressDetails(aliceAddress).stakeCredential);


Deno.test("Mint our 8 tokens", async () => {

    // const tx = await lucid.newTx()
    //     .mintAssets(assetsToMint, Data.void())
    //     .attach.MintingPolicy(mintingPolicy)
    //     .pay.ToContract(scriptAddress, {kind: "inline", value: Data.void()}, assetsToMint)
    //     .complete();

   
    

});