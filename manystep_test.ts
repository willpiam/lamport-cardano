import {
  applyParamsToScript,
  Assets,
  Constr,
  Data,
  Emulator,
  fromText,
  generateEmulatorAccount,
  getAddressDetails,
  Lucid,
  MintingPolicy,
  mintingPolicyToId,
  paymentCredentialOf,
  scriptFromNative,
  SpendingValidator,
  validatorToAddress,
} from "npm:@lucid-evolution/lucid";
import blueprint from "./lamport-validator/plutus.json" with { type: "json" };
import {
  assert,
  assertEquals,
  assertExists,
  assertNotEquals,
  assertRejects,
} from "@std/assert";
import { generateSeed } from "./Lamport.ts";
import { Redeemer, toHex } from "npm:@blaze-cardano/core";
import { MultiStepLamport } from "./MultiStepLamport.ts";
import { MerkleTree } from "./MerkleTree.ts";

// Setup test accounts
const alice = generateEmulatorAccount({
  lovelace: 100_000_000n, // 100 ada
});

const emulator = new Emulator([alice]);
const lucid = await Lucid(emulator, "Custom");
lucid.selectWallet.fromSeed(alice.seedPhrase);
const aliceAddress = await lucid.wallet().address();

const rawValidator =
  blueprint.validators.find((v) =>
    v.title === "manystep.manysteplamport.spend"
  )!.compiledCode;
const parameterizedValidator = applyParamsToScript(rawValidator, [0n]);

const mintingPolicy: MintingPolicy = {
  type: "PlutusV3",
  script: parameterizedValidator,
};
const policyId = mintingPolicyToId(mintingPolicy);
const units = Array.from(
  { length: 8 },
  (_, i) => policyId + fromText(`${i + 1}`),
);
const assetsToMint = units.reduce((acc, unit) => ({ ...acc, [unit]: 1n }), {});

const validator: SpendingValidator = {
  type: "PlutusV3",
  script: parameterizedValidator,
};
const scriptAddress = validatorToAddress(
  "Custom",
  validator,
  getAddressDetails(aliceAddress).stakeCredential,
);

const MintAction = {
  Mint: Data.to(new Constr(0, [])),
  Burn: Data.to(new Constr(1, [])),
};

const State = {
  Initial: (tokensNotInitialized: bigint, publicKeyMerkleRoot: Uint8Array) =>
    Data.to(
      new Constr(0, [tokensNotInitialized, toHex(publicKeyMerkleRoot)]),
    ),
  Default: () => new Constr(1, []),
};

const SpendAction = {
  InitializePublicKeyChunk: (merkleProof : Uint8Array, position : bigint) => Data.to(new Constr(0, [toHex(merkleProof), position])),
  VerifySignatureChunk: Data.to(new Constr(1, [])),
  VerifyFullSignature: Data.to(new Constr(2, [])),
};

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

  const signatureParts = await msLamport.signToParts(
    new TextEncoder().encode("Hello, world!"),
  );
  assertEquals(signatureParts.length, 8);

  for (const part of signatureParts) {
    assertEquals(part.length, 32);
  }

  const verified = await MultiStepLamport.verifyFromParts(
    new TextEncoder().encode("Hello, world!"),
    signatureParts,
    publicKeyParts,
  );
  assertEquals(verified, true);

  // get the merkle root
  const merkleRoot = await msLamport.publicKeyMerkleRoot();
  console.log("Merkle root:", toHex(merkleRoot));
});

Deno.test("Off-chain Merkle tree", async () => {
  const initialData = Array.from(
    { length: 8 },
    (_, i) => new TextEncoder().encode(`${i + 1}`),
  );
  console.log("Initial data:", initialData);

  const merkleTree = new MerkleTree(initialData);
  await merkleTree.build();

  const root = merkleTree.getRoot();
  console.log("Root:", toHex(root));

  {
    const proof = merkleTree.getProofByIndex(0);
    const verified = await merkleTree.verifyProof(initialData[0], proof, root);
    console.log("Verified:", verified);
    assertEquals(verified, true, "Proof should be valid for the first element");

    // cannot use this proof to verify the second element
    const verified2 = await merkleTree.verifyProof(initialData[1], proof, root);
    console.log("Verified2:", verified2);
    assertEquals(verified2, false, "Proof should not be valid for other elements");
  }

  // generate and verify a proof for each element
  for (let i = 0; i < merkleTree.leafCount - 1; i++) {
    const proof = merkleTree.getProofByIndex(i);
    const verified = await merkleTree.verifyProof(initialData[i], proof, root);
    assertEquals(verified, true, "Proof should be valid for the element");
  }
});

type TestState = {
  msLamport : MultiStepLamport | null,
  assetsToInitialize : Assets | null,
}
const testState : TestState = {
  msLamport : null,
  assetsToInitialize : null,
}
testState.assetsToInitialize = assetsToMint;

Deno.test("Mint our 8 tokens", async () => {
  testState.msLamport = new MultiStepLamport(await generateSeed());
  const merkleRoot = await testState.msLamport.publicKeyMerkleRoot();
  const initialState = State.Initial(8n, merkleRoot);
  console.log(`Initial state: ${initialState}`);

  {
    const scriptUtxos = await lucid.utxosAt(scriptAddress);
    assertEquals(scriptUtxos.length, 0, "There should be no utxos on the script address at this point in the test");
  }

  const tx = await lucid.newTx()
    .mintAssets(assetsToMint, MintAction.Mint)
    .attach.MintingPolicy(mintingPolicy)
    .pay.ToContract(
      scriptAddress,
      { kind: "inline", value: initialState },
      assetsToMint,
    )
    .complete();

  const signed = await tx.sign.withWallet().complete();
  const txHash = await signed.submit();

  await lucid.awaitTx(txHash);

  const scriptUtxos = await lucid.utxosAt(scriptAddress);
  assertEquals(scriptUtxos.length, 1, "There should be 1 utxo on the script address at this point in the test");
  const scriptUtxo = scriptUtxos[0];
  const assetsOnScript = Object.keys(scriptUtxo.assets);
  console.log("Assets on script:", assetsOnScript);
  assertEquals(assetsOnScript.length, 9, "There should be 9 (8 tokens + lovelace) assets on the script utxo");
});

/*
  At this point we have 8 tokens in a single utxo on our script. 
  On this utxo we have a datum with a counter set to 8 (representing that we have 8 tokens to initialize)
  and a merkle root.

  Next we will initialize the first public key chunk. This will mean spending the 8 tokens and
  creating 2 new utxos. The first will hold the remaining 7 tokens. The counter will be decremented by 1 and the 
  merkle root will remain unchanged. The second utxo will hold 1 token and a datum containing the public key chunk. 

  This procedure will be repeated for each public key chunk.
 */
Deno.test("Initalize the first public key chunk", async () => {
  assertExists(testState.assetsToInitialize, "The assetsToInitialize should be initialized at this point in the test");

  const scriptUtxos = await lucid.utxosAt(scriptAddress);
  assertEquals(scriptUtxos.length, 1, "There should be 1 utxo on the script address at this point in the test");

  assertExists(testState.msLamport, "The msLamport should be initialized at this point in the test");
  const merkleRoot = await testState.msLamport.publicKeyMerkleRoot();
  const newInitialState = State.Initial(7n, merkleRoot);

  const unitToSpend = policyId + fromText("1");
  // remove unit to spend from assetsToInitialize
  delete testState.assetsToInitialize[unitToSpend];

  const PartialPublicKeyDatum = Data.void();

  const tx = await lucid.newTx()
    .collectFrom(scriptUtxos, SpendAction.InitializePublicKeyChunk(merkleRoot, 0n))
    .attach.SpendingValidator(validator)
    .pay.ToContract(
      scriptAddress, 
      { kind: "inline", value: newInitialState },
      testState.assetsToInitialize,
    )
    .pay.ToContract(
      scriptAddress,
      { kind: "inline", value: PartialPublicKeyDatum },
      { [unitToSpend]: 1n },
    )
    .complete();

  const signed = await tx.sign.withWallet().complete();
  const txHash = await signed.submit();

  await lucid.awaitTx(txHash);

})