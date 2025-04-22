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
import { generateSeed, Lamport, signatureToHex } from "./Lamport.ts";
import { toHex } from "npm:@blaze-cardano/core";
import {
  assertEquals,
  assert,
  assertExists,
  assertRejects,
} from "@std/assert";
import { flipBitInSignature, toBinaryString, binaryStringXor, burn } from "./testHelpers.ts";

const KEY_STRENGTH = 30; // 63 seems to be the upper limit

// Setup test accounts
const alice = generateEmulatorAccount({
  lovelace: 100_000_000n, // 100 ada
});

const emulator = new Emulator([alice]);
const lucid = await Lucid(emulator, "Custom");
lucid.selectWallet.fromSeed(alice.seedPhrase);
const aliceAddress = await lucid.wallet().address();

// Setup minting policy for test token
const mintingPolicy = scriptFromNative({
  type: "all",
  scripts: [
    {
      type: "sig",
      keyHash: paymentCredentialOf(aliceAddress).hash,
    },
  ],
});

const policyId = mintingPolicyToId(mintingPolicy);
const unit = policyId + fromText("MyToken");

// Setup Lamport validator
const rawValidator =
  blueprint.validators.find((v) => v.title === "lamport.lamport.spend")!
    .compiledCode;
const parameterizedValidator = applyParamsToScript(
  rawValidator,
  [
    0n, // version
    BigInt(KEY_STRENGTH), // strength
  ],
);

const validator: SpendingValidator = {
  type: "PlutusV3",
  script: parameterizedValidator,
};

const lockAddress = validatorToAddress(
  "Custom",
  validator,
  getAddressDetails(aliceAddress).stakeCredential,
);
const lamport = new Lamport(await generateSeed(), KEY_STRENGTH);
const encoder = new TextEncoder();
const message = encoder.encode("Unlocking the asset");

Deno.test("Initial Token Minting", async () => {
  const tx = await lucid
    .newTx()
    .mintAssets({
      [unit]: 1n,
    })
    .pay.ToAddress(aliceAddress, { [unit]: 1n })
    .validTo(Date.now() + 900000)
    .attach.MintingPolicy(mintingPolicy)
    .complete();

  const signed = await tx.sign.withWallet().complete();
  const txHash = await signed.submit();

  await lucid.awaitTx(txHash);

  const utxo = await emulator.getUtxoByUnit(unit);
  assertExists(utxo, "Token should be minted");
  assertEquals(
    utxo.address,
    aliceAddress,
    "Token must be minted to alice's address",
  );
});

Deno.test("Lock Assets in Lamport Validator", async () => {
  const [pubLeft, pubRight] = await lamport.publicKey();
  const lamportDatum = Data.to(
    new Constr(0, [pubLeft.map(toHex), pubRight.map(toHex), toHex(message)]),
  );

  const tx = await lucid
    .newTx()
    .pay.ToContract(lockAddress, { kind: "inline", value: lamportDatum }, {
      [unit]: 1n,
    })
    .complete();

  const signed = await tx.sign.withWallet().complete();
  const txHash = await signed.submit();

  await lucid.awaitTx(txHash);

  const utxo = await emulator.getUtxoByUnit(unit);
  assertExists(utxo, "Token should be locked");
  assertEquals(
    utxo.address,
    lockAddress,
    "Token must be locked in the validator",
  );
});

// a bunch of stuff that will not work to unlock the asset
Deno.test("Use a completely wrong lamport key", async () => {
  const badLamport = new Lamport(await generateSeed(), KEY_STRENGTH);
  const scriptUtxo = await emulator.getUtxoByUnit(unit);
  assertExists(scriptUtxo, "Script UTxO should exist");

  const lsignature = await badLamport.sign(message);

  const redeemer = Data.to(
    new Constr(0, [toHex(message), signatureToHex(lsignature)]),
  );

  const tx = lucid
    .newTx()
    .collectFrom([scriptUtxo], redeemer)
    .attach.SpendingValidator(validator)
    .pay.ToAddress(aliceAddress, { [unit]: 1n });

  await assertRejects(
    async () => await tx.complete(),
    "Should not be able to unlock with wrong key",
  );
});

Deno.test("Use a wrong message", async () => {
  const scriptUtxo = await emulator.getUtxoByUnit(unit);
  assertExists(scriptUtxo, "Script UTxO should exist");

  const message = encoder.encode("THIS IS THE WRONG MESSAGE");
  const lsignature = await lamport.sign(message);

  const redeemer = Data.to(
    new Constr(0, [toHex(message), signatureToHex(lsignature)]),
  );

  const tx = lucid
    .newTx()
    .collectFrom([scriptUtxo], redeemer)
    .attach.SpendingValidator(validator)
    .pay.ToAddress(aliceAddress, { [unit]: 1n });

  await assertRejects(
    async () => await tx.complete(),
    "Should not be able to unlock with wrong message",
  );
});

Deno.test("Flip a bit in the signature", async () => {
  const scriptUtxo = await emulator.getUtxoByUnit(unit);
  assertExists(scriptUtxo, "Script UTxO should exist");

  const message = encoder.encode("Unlocking the asset");
  const lsignature: Uint8Array<ArrayBufferLike>[] = await lamport.sign(message);
  // flip single bit
  const bitPositionsToConsider = [0, 1, 100, 3001, 3002];
  const bitPosition = bitPositionsToConsider[Math.floor(Math.random() * bitPositionsToConsider.length)];
  const lsignatureBroken = flipBitInSignature(lsignature, bitPosition);

  const goodSignature = toBinaryString(lsignature);
  const brokenSignature = toBinaryString(lsignatureBroken);
  const goodBadDiff = binaryStringXor(goodSignature, brokenSignature);
  const countOnes = (str: string) => str.split("").filter((c) => c === "1").length;
  assertEquals(countOnes(goodBadDiff), 1); // only one bit is different

  const redeemer = Data.to(
    new Constr(0, [toHex(message), signatureToHex(lsignatureBroken)]),
  );

  const txbuilder = lucid
    .newTx()
    .collectFrom([scriptUtxo], redeemer)
    .attach.SpendingValidator(validator)
    .pay.ToAddress(aliceAddress, { [unit]: 1n });

  await assertRejects(
    async () => await txbuilder.complete(),
    "Should not be able to unlock with wrong signature",
  );
});

// finally, actually unlock the asset
Deno.test("Unlock Assets from Lamport Validator", async () => {
  const scriptUtxo = await emulator.getUtxoByUnit(unit);
  assertExists(scriptUtxo, "Script UTxO should exist");

  const message = encoder.encode("Unlocking the asset");
  const lsignature = await lamport.sign(message);

  const redeemer = Data.to(
    new Constr(0, [toHex(message), signatureToHex(lsignature)]),
  );

  const txbuilder = lucid
    .newTx()
    .collectFrom([scriptUtxo], redeemer)
    .attach.SpendingValidator(validator)
    .pay.ToAddress(aliceAddress, { [unit]: 1n });

  const tx = await txbuilder.complete();

  const signed = await tx.sign.withWallet().complete();
  const txHash = await signed.submit();

  await lucid.awaitTx(txHash);

  const utxo = await emulator.getUtxoByUnit(unit);
  assertExists(utxo, "Token should be unlocked");
  assertEquals(
    utxo.address,
    aliceAddress,
    "Token must be unlocked and present on alice's address",
  );

//   const burnTxHash = await burn(lucid, mintingPolicy, unit, 1n);
//   await emulator.awaitTx(burnTxHash);
//   const utxoAfterBurn = await emulator.getUtxoByUnit(unit);
//   assert(utxoAfterBurn === undefined, "Token should be burned");
});
