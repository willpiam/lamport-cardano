import { applyParamsToScript, Constr, Data, Emulator, fromText, generateEmulatorAccount, getAddressDetails, Lucid, MintingPolicy, mintingPolicyToId, paymentCredentialOf, scriptFromNative, SpendingValidator, validatorToAddress } from "npm:@lucid-evolution/lucid";
import blueprint from "./lamport-validator/plutus.json" with { type: "json" };
import {
  assertEquals,
  assert,
  assertExists,
  assertRejects,
  assertNotEquals,
} from "@std/assert";
import { generateSeed } from "./Lamport.ts";
import { toHex } from "npm:@blaze-cardano/core";
import { MultiStepLamport } from "./MultiStepLamport.ts";

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

const MintAction = {
  Mint: Data.to(new Constr(0, [])),
  Burn: Data.to(new Constr(1, [])),
};

const State = {
    Initial: (tokensNotInitialized: bigint, publicKeyMerkleRoot: Uint8Array) => Data.to(
      new Constr(0, [tokensNotInitialized, toHex(publicKeyMerkleRoot)])
    ),
    Default: () => new Constr(1, []),
}

Deno.test("Off-chain multi-step lamport", async () => {
  const msLamport = new MultiStepLamport(await generateSeed());
  const privateKeyParts = await msLamport.privateKeyParts();

  // assert that the length of the private key parts is 8
  assertEquals(privateKeyParts.length, 8);

  for (const part of privateKeyParts) {
    assertEquals(part[0].length, 32);
    assertEquals(part[1].length, 32);

    // assert that the left and right parts are different
    assertNotEquals(part[0], part[1]);
  }

  const publicKeyParts = await msLamport.publicKeyParts();
  assertEquals(publicKeyParts.length, 8);

  for (const part of publicKeyParts) {
    assertEquals(part[0].length, 32);
    assertEquals(part[1].length, 32);

    // assert that the left and right parts are different
    assertNotEquals(part[0], part[1]);
  }

  const signatureParts = await msLamport.signToParts(new TextEncoder().encode("Hello, world!"));
  assertEquals(signatureParts.length, 8);

  for (const part of signatureParts) {
    assertEquals(part.length, 32);
  }

  const verified = await MultiStepLamport.verifyFromParts(new TextEncoder().encode("Hello, world!"), signatureParts, publicKeyParts);
  assertEquals(verified, true);
});

Deno.test("Mint our 8 tokens", async () => {
    const seed = await generateSeed();
    const initialState = State.Initial(8n, seed);
    console.log(`Initial state: ${initialState}`);

    const tx = await lucid.newTx()
        .mintAssets(assetsToMint, MintAction.Mint)
        .attach.MintingPolicy(mintingPolicy)
        .pay.ToContract(scriptAddress, {kind: "inline", value: initialState}, assetsToMint)
        .complete();

    const signed = await tx.sign.withWallet().complete();
    const txHash = await signed.submit();

    await lucid.awaitTx(txHash);
});