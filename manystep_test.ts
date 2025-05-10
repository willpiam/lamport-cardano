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
import { toHex } from "npm:@blaze-cardano/core";
import { LamportPublicKeyChunk, MultiStepLamport } from "./MultiStepLamport.ts";
import { MerkleTree, ProofNode } from "./MerkleTree.ts";
import { sha256 } from "./sha256.ts";
import { flipBitInSignature } from "./testHelpers.ts";

// Setup test accounts
const alice = generateEmulatorAccount({
  lovelace: 1_000_000_000n, // 1,000 ada
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
const assetsToMint = units.reduce((acc, unit) => ({ ...acc, [unit]: 1n }), {} as Assets);

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
  PreparedPublicKeyChunk: (
    chunkPosition: bigint,
    chunk: LamportPublicKeyChunk,
  ) =>
    Data.to(
      new Constr(1, [
        chunkPosition,
        new Constr(0, [chunk[0].map(toHex), chunk[1].map(toHex)]),
      ]),
    ),
  SignedMessageChunk: (messagePosition: bigint, messageChunk: Uint8Array) =>
    Data.to(
      new Constr(2, [messagePosition, toHex(messageChunk)]),
    ),
};

const Bool = {
  False: new Constr(0, []),
  True: new Constr(1, []),
};

const ProofNodeData = (proofNode: ProofNode) =>
  new Constr(0, [
    toHex(proofNode.hash),
    proofNode.siblingOnLeft ? Bool.True : Bool.False,
  ]);
const SpendAction = {
  InitializePublicKeyChunk: (
    merkleProof: ProofNode[],
    position: bigint,
    leafHash: Uint8Array,
  ) =>
    Data.to(
      new Constr(0, [
        merkleProof.map(ProofNodeData),
        position,
        toHex(leafHash),
      ]),
    ),
  VerifySignatureChunk: (signatureChunk: Uint8Array[]) => Data.to(new Constr(1, [signatureChunk.map(toHex)])),
  VerifyFullSignature: (message: Uint8Array) => Data.to(new Constr(2, [toHex(message)])),
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
  assertEquals(merkleRoot.length, 32);
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
    assertEquals(
      verified2,
      false,
      "Proof should not be valid for other elements",
    );
  }

  // generate and verify a proof for each element
  for (let i = 0; i < merkleTree.leafCount - 1; i++) {
    const proof = merkleTree.getProofByIndex(i);
    const verified = await merkleTree.verifyProof(initialData[i], proof, root);
    assertEquals(verified, true, "Proof should be valid for the element");
  }
});

type TestState = {
  msLamport: MultiStepLamport | null;
  assetsToInitialize: Assets | null;
  message : string | null;
};
const testState: TestState = {
  msLamport: null,
  assetsToInitialize: null,
  message: null,
};
testState.assetsToInitialize = structuredClone(assetsToMint);

Deno.test("Mint our 8 tokens", async () => {
  testState.msLamport = new MultiStepLamport(await generateSeed());
  const merkleRoot = await testState.msLamport.publicKeyMerkleRoot();
  const initialState = State.Initial(8n, merkleRoot);
  console.log(`Initial state: ${initialState}`);
  console.log(`Initial root:  ${toHex(merkleRoot)}`);

  {
    const scriptUtxos = await lucid.utxosAt(scriptAddress);
    assertEquals(
      scriptUtxos.length,
      0,
      "There should be no utxos on the script address at this point in the test",
    );
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
  assertEquals(
    scriptUtxos.length,
    1,
    "There should be 1 utxo on the script address at this point in the test",
  );
  const scriptUtxo = scriptUtxos[0];
  const assetsOnScript = Object.keys(scriptUtxo.assets);
  console.log("Assets on script:", assetsOnScript);
  assertEquals(
    assetsOnScript.length,
    9,
    "There should be 9 (8 tokens + lovelace) assets on the script utxo",
  );
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
  assertExists(
    testState.assetsToInitialize,
    "The assetsToInitialize should be initialized at this point in the test",
  );

  const scriptUtxos = await lucid.utxosAt(scriptAddress);
  assertEquals(
    scriptUtxos.length,
    1,
    "There should be 1 utxo on the script address at this point in the test",
  );

  assertExists(
    testState.msLamport,
    "The msLamport should be initialized at this point in the test",
  );
  const merkleRoot = await testState.msLamport.publicKeyMerkleRoot();
  const merkleProof: ProofNode[] = testState.msLamport.publicKeyMerkleProof(0);
  console.log(`Merkle proof:  ${merkleProof.map((p) => toHex(p.hash)).join(", ")}`);
  const leafHash = testState.msLamport.chunkLeafHash(0);
  console.log(`Leaf hash: ${toHex(leafHash)}`);

  const newInitialState = State.Initial(7n, merkleRoot);

  const unitToSpend = policyId + fromText("1");
  // remove unit to spend from assetsToInitialize
  delete testState.assetsToInitialize[unitToSpend];

  const publicKeyParts = await testState.msLamport.publicKeyParts();
  const firstPublicKeyChunk = publicKeyParts[0];

  const tx = await lucid.newTx()
    .collectFrom(
      scriptUtxos,
      SpendAction.InitializePublicKeyChunk(merkleProof, 0n, leafHash),
    )
    .attach.SpendingValidator(validator)
    .pay.ToContract(
      scriptAddress,
      { kind: "inline", value: newInitialState },
      testState.assetsToInitialize,
    )
    .pay.ToContract(
      scriptAddress,
      {
        kind: "inline",
        value: State.PreparedPublicKeyChunk(0n, firstPublicKeyChunk),
      },
      { [unitToSpend]: 1n },
    )
    .complete();

  const signed = await tx.sign.withWallet().complete();
  const txHash = await signed.submit();

  await lucid.awaitTx(txHash);
});

Deno.test("Initialize the other public key chunks", async () => {
  const initialize = async (position: number) => {
    assert(position >= 0, "Position must be greater than or equal to 0");
    assert(position < 8, "Position must be less than 8");

    const scriptUtxos = await lucid.utxosAt(scriptAddress);
    assert(scriptUtxos.length === 1 + position, "Unxpected number of script utxos");
    assertExists(testState.msLamport, "The msLamport should be initialized at this point in the test");
    const merkleRoot = await testState.msLamport.publicKeyMerkleRoot();
    const merkleProof: ProofNode[] = testState.msLamport.publicKeyMerkleProof(position);
    const leafHash = testState.msLamport.chunkLeafHash(position);

    const newInitialState = State.Initial(8n - (BigInt(position) + 1n), merkleRoot);
    const unitToSpend = policyId + fromText(`${position + 1}`);
    
    assertExists(testState.assetsToInitialize, "The assetsToInitialize should be initialized at this point in the test");
    delete testState.assetsToInitialize[unitToSpend];
    // console.log(`%cAssets to initialize after this one: ${JSON.stringify(Object.keys(testState.assetsToInitialize), null, 2)}`, "color: pink");
  
    const publicKeyParts = await testState.msLamport.publicKeyParts();
    const publicKeyChunk = publicKeyParts[position];

     // find the script utxo with the uninitialized tokens
    const uninitializedUtxo = scriptUtxos.find((utxo) => {
      // we'll know its the right one because the datum should match the expected value
      const expectedDatum : string = State.Initial(8n - (BigInt(position)), merkleRoot); 
      return utxo.datum === expectedDatum;
    })

    assertExists(uninitializedUtxo, "should have found the uninitialized tokensutxo");

    const tx = await lucid.newTx()
      .collectFrom(
        [uninitializedUtxo],
        SpendAction.InitializePublicKeyChunk(merkleProof, BigInt(position), leafHash),
      )
      .attach.SpendingValidator(validator)
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: newInitialState },
        testState.assetsToInitialize,
      )
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: State.PreparedPublicKeyChunk(BigInt(position), publicKeyChunk) },
        { [unitToSpend]: 1n },
      )
      .complete();

    const signed = await tx.sign.withWallet().complete();
    const txHash = await signed.submit();

    await lucid.awaitTx(txHash);
  };

  // skip zero because it's already initialized
  await initialize(1);
  await initialize(2);
  await initialize(3);
  await initialize(4);
  await initialize(5);
  await initialize(6);
  await initialize(7);
});

/*
  All of the public key chunks have been initialized. The entier lamport public key is now
  on-chain, stored over 8 outputs.

  We now need to decide what to sign. In later experiments we will sign the hash of some 
  "representation of the transaction". This is will not the typical tx hash because our
  signature is going in the redeemer and would be included in the preimage of the tx hash.

  For now we will be signing a simple english message.

  When we sign the message we will need to break the signature into chunks and use each
  chunk to spend an initialized token. Spending this token enforces that the signature match
  the message chunk (located in the new datum) and the public key chunk (located in the spent datum).

  Once all the tokens have been spent like this they will point to a datum with much less data 
  than in the previous state. This datum will only contain a chunk of the message (1/8th of 
  the hashed message) and its position. 

  After that to verify the signature we ensure the 8 chunks are present, concatinate their message
  chunks in order depending on their position value and compare the result with the hashed message.
  If they are the same we know the message was signed. 
*/

Deno.test("Sign a message", async () => {
  assertExists(testState.msLamport, "The msLamport should be initialized at this point in the test");
  testState.message = "Hello, world!";

  const message = new TextEncoder().encode(testState.message);
  const messageHash = await sha256(message);
  console.log(`Message hash: ${toHex(messageHash)}`);

  const signatureParts = await testState.msLamport.signToParts(messageHash);
  const publicKeyParts = await testState.msLamport.publicKeyParts();
  assert(await MultiStepLamport.verifyFromParts(messageHash, signatureParts, publicKeyParts), "The signature should be valid");
});

Deno.test("Sign and verify first message chunk", async () => {
  assertExists(testState.msLamport, "The msLamport should be initialized at this point in the test");
  testState.message = `Hello, world! ${Date.now()}`;
  console.log(`Message:      ${testState.message}`);

  const message = new TextEncoder().encode(testState.message);
  // const messageHash = await sha256(message);
  // console.log(`Message hash: ${toHex(messageHash)}`);
  // console.log(`Message hash length ${messageHash.length}`);

  const signatureParts = await testState.msLamport.signToParts(message);
  const publicKeyParts = await testState.msLamport.publicKeyParts();
  assert(await MultiStepLamport.verifyFromParts(message, signatureParts, publicKeyParts), "The signature should be valid");

  const scriptUtxos = await lucid.utxosAtWithUnit(scriptAddress, policyId + fromText("1"));
  assertEquals(scriptUtxos.length, 1, "There should be 1 utxo on the script address at this point in the test");

  const messageHash = await sha256(message);
  const firstFourBytesOfMessageHash = messageHash.slice(0, 4);
  console.log(`First four bytes of message hash: ${toHex(firstFourBytesOfMessageHash)}`);

  const tx = await lucid.newTx()
    .collectFrom(
      scriptUtxos,
      SpendAction.VerifySignatureChunk(signatureParts[0]),
    )
    .attach.SpendingValidator(validator)
    .pay.ToContract(
      scriptAddress,
      { kind: "inline", value: State.SignedMessageChunk(0n, firstFourBytesOfMessageHash) },
      { [policyId + fromText("1")]: 1n },
    )
    .complete();

  const signed = await tx.sign.withWallet().complete();
  const txHash = await signed.submit();

  await lucid.awaitTx(txHash);
});

/*
  Now make the rest of the signature chunks
*/
Deno.test("Post the rest of the signature on-chain", async () => {
  assertExists(testState.msLamport, "The msLamport should be initialized at this point in the test");
  console.log(`Message:      ${testState.message}`);
  assertExists(testState.message, "The message should be initialized at this point in the test");
  const message = new TextEncoder().encode(testState.message);

  const signatureParts = await testState.msLamport.signToParts(message);
  const publicKeyParts = await testState.msLamport.publicKeyParts();
  assert(await MultiStepLamport.verifyFromParts(message, signatureParts, publicKeyParts), "The signature should be valid");

  const messageHash = await sha256(message);
  console.log(`Message hash: ${toHex(messageHash)}`);

  const postSignaturePart = async (position: number) => {
    assert(position >= 0, "Position must be greater than or equal to 0");
    assert(position < 8, "Position must be less than 8");

    const scriptUtxos = await lucid.utxosAtWithUnit(scriptAddress, policyId + fromText(`${position + 1}`));
    assertEquals(scriptUtxos.length, 1, "There should be 1 utxo on the script address at this point in the test");

    const messageHashChunk = messageHash.slice(position * 4, (position + 1) * 4);
    console.log(`Message hash chunk ${position}: ${toHex(messageHashChunk)}`);

    const tx = await lucid.newTx()
      .collectFrom(
        scriptUtxos,
        SpendAction.VerifySignatureChunk(signatureParts[position]),
      )
      .attach.SpendingValidator(validator)
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: State.SignedMessageChunk(BigInt(position), messageHashChunk) },
        { [policyId + fromText(`${position + 1}`)]: 1n },
      )
      .complete();

    const signed = await tx.sign.withWallet().complete();
    const txHash = await signed.submit();

    await lucid.awaitTx(txHash);
  }

  await postSignaturePart(1);
  await postSignaturePart(2);
  await postSignaturePart(3);
  await postSignaturePart(4);
  await postSignaturePart(5);
  await postSignaturePart(6);
  await postSignaturePart(7);
});

/*
  The eight tokens no longer have a public key on them. Instead they now each have a small piece of 
  the message hash (4 bytes) and a position value.

  The final step is to spend all of these tokens in a single transaction and piece together the message hash
  before comparing it to the hash of the original message on-chain.
*/
Deno.test("Spend the tokens and verify the message", async () => {
  const scriptUtxos = await lucid.utxosAt(scriptAddress).then(
    utxos => utxos.filter(
      utxo => Object.keys(utxo.assets).some((asset) => asset.startsWith(policyId))
    ));
  
  assertEquals(scriptUtxos.length, 8, "There should be 8 utxos on the script address at this point in the test");
  assertExists(testState.message, "The message should be initialized at this point in the test");

  const message = new TextEncoder().encode(testState.message);

  // const assetsToBurn = ["1", "2", "3", "4", "5", "6", "7", "8"]
  const assetsToBurn = Array.from({length: 8}, (_, index) => `${1 + index}` ) 
    .map(unit => policyId + fromText(unit))
    .reduce((acc, unit) => ({ ...acc, [unit]: -1n }), {});

  const tx = await lucid.newTx()
    .collectFrom(scriptUtxos, SpendAction.VerifyFullSignature(message))
    .attach.SpendingValidator(validator)
    .attach.MintingPolicy(mintingPolicy)
    .mintAssets(assetsToBurn, MintAction.Burn)
    .complete();

  const signed = await tx.sign.withWallet().complete();
  const txHash = await signed.submit();

  await lucid.awaitTx(txHash);

  // expect that neither the script address nor the wallet address have any assets with the policy id
  const assertNoAssetsFromPolicy = async (address: string) => {
    const utxos = await lucid.utxosAt(address)
    const assets = utxos.flatMap(utxo => Object.keys(utxo.assets))
    console.log(`%cAssets on ${address}: ${JSON.stringify(assets, null, 2)}`, "color: hotpink")
    for (const asset of assets) {
      assert(!asset.startsWith(policyId), `The asset ${asset} should not start with the policy id`);
    }
  }

  await assertNoAssetsFromPolicy(scriptAddress);
  await assertNoAssetsFromPolicy(await lucid.wallet().address());
});


/*
    Here I demonstrate that what shouldn't work, doesn't work.
    --------------------------------------------------------------------------------
    --------------------------------------------------------------------------------
    --------------------------------------------------------------the negative tests
    --------------------------------------------------------------------------------
    --------------------------------------------------------------------------------
*/
Deno.test("Bad ways to mint", async (t) => {
  assertExists(testState.msLamport, "The msLamport should be initialized at this point in the test");
  const merkleRoot = await testState.msLamport.publicKeyMerkleRoot();
  const initialState = State.Initial(8n, merkleRoot);
  console.log(`Initial state: ${initialState}`);
  console.log(`Initial root:  ${toHex(merkleRoot)}`);
  console.log("assetsToMint", assetsToMint)

  await t.step("This is how it should actually be done", async () => {
    await lucid.newTx()
      .mintAssets(assetsToMint, MintAction.Mint)
      .attach.MintingPolicy(mintingPolicy)
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: initialState },
        assetsToMint,
      )
      .complete();
  });

  await t.step("Send to wrong address", async () => {
    const incomplete = lucid.newTx()
      .mintAssets(assetsToMint, MintAction.Mint)
      .attach.MintingPolicy(mintingPolicy)
      .pay.ToContract(
        await lucid.wallet().address(),
        { kind: "inline", value: initialState },
        assetsToMint,
      )

      await assertRejects(incomplete.complete, "Bad because the address is wrong")
  });

  await t.step("Mint wrong amount - only 7", async () => {
    const badAssetsToMint = structuredClone(assetsToMint);

    badAssetsToMint[policyId + fromText("8")] = 0n;
    const incomplete = lucid.newTx()
      .mintAssets(badAssetsToMint, MintAction.Mint)
      .attach.MintingPolicy(mintingPolicy)
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: initialState },
        badAssetsToMint,
      )

      await assertRejects(incomplete.complete, "Bad because the amount is wrong")
  });

  await t.step("Mint wrong amount - too many (9)", async () => {
    const badAssetsToMint = structuredClone(assetsToMint);
    badAssetsToMint[policyId + fromText("9")] = 1n;

    const incomplete = lucid.newTx()
      .mintAssets(badAssetsToMint, MintAction.Mint)
      .attach.MintingPolicy(mintingPolicy)
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: initialState },
        badAssetsToMint,
      )

      await assertRejects(incomplete.complete, "Bad because the amount is wrong")
  });

  await t.step("Mint wrong amount - mint 2 of the first token", async () => {
    const badAssetsToMint = structuredClone(assetsToMint);
    badAssetsToMint[policyId + fromText("1")] = 2n;

    const incomplete = lucid.newTx()
      .mintAssets(badAssetsToMint, MintAction.Mint)
      .attach.MintingPolicy(mintingPolicy)
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: initialState },
        badAssetsToMint,
      )

      await assertRejects(incomplete.complete, "Bad because the amount is wrong")
  });

  /*

  Template for bad minting: 

  await t.step("", async () => {
    const incomplete = lucid.newTx()
      .mintAssets(assetsToMint, MintAction.Mint)
      .attach.MintingPolicy(mintingPolicy)
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: initialState },
        assetsToMint,
      )

      await assertRejects(incomplete.complete, "")
  });

  */
  await t.step("Bad datum", async () => {
    const badInitialState = State.Initial(7n, merkleRoot);
    const incomplete = lucid.newTx()
      .mintAssets(assetsToMint, MintAction.Mint)
      .attach.MintingPolicy(mintingPolicy)
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: badInitialState },
        assetsToMint,
      )

      await assertRejects(incomplete.complete, "Bad because tokens_not_initalized is wrong")
  });
});

Deno.test("Bad ways to initialize", async (t) => {
  assertExists(testState.msLamport, "The msLamport should be initialized at this point in the test");
  const merkleRoot = await testState.msLamport.publicKeyMerkleRoot();
  const initialState = State.Initial(8n, merkleRoot);
  console.log(`Initial state: ${initialState}`);
  console.log(`Initial root:  ${toHex(merkleRoot)}`);
  console.log("assetsToMint", assetsToMint)

  await t.step("Mint the tokens", async () => {
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
  });

  const position = 0;
  const assetsToInitialize = structuredClone(assetsToMint);
  delete assetsToInitialize[policyId + fromText(`${position + 1}`)];
  assertExists(testState.msLamport, "The msLamport should be initialized at this point in the test");
  const scriptUtxos = await lucid.utxosAt(scriptAddress);
  const merkleProof: ProofNode[] = testState.msLamport.publicKeyMerkleProof(position);
  const leafHash = testState.msLamport.chunkLeafHash(position);

  const newInitialState = State.Initial(8n - (BigInt(position) + 1n), merkleRoot);
  const unitToSpend = policyId + fromText(`${position + 1}`);
    
  const publicKeyParts = await testState.msLamport.publicKeyParts();
  const publicKeyChunk = publicKeyParts[position];

    // find the script utxo with the uninitialized tokens
  const uninitializedUtxo = scriptUtxos.find((utxo) => {
    // we'll know its the right one because the datum should match the expected value
    const expectedDatum : string = State.Initial(8n - (BigInt(position)), merkleRoot); 
    return utxo.datum === expectedDatum;
  })

  assertExists(uninitializedUtxo, "should have found the uninitialized tokensutxo");

  await t.step("The correct way to initialize", async () => {
    const incomplete = lucid.newTx()
      .collectFrom(
        [uninitializedUtxo],
        SpendAction.InitializePublicKeyChunk(merkleProof, BigInt(position), leafHash),
      )
      .attach.SpendingValidator(validator)
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: newInitialState },
        assetsToInitialize,
      )
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: State.PreparedPublicKeyChunk(BigInt(position), publicKeyChunk) },
        { [unitToSpend]: 1n },
      )

      await incomplete.complete();
  });

  await t.step("Specify wrong position", async () => {
    const wrongPosition = position + 1;
    const incomplete = lucid.newTx()
      .collectFrom(
        [uninitializedUtxo],
        SpendAction.InitializePublicKeyChunk(merkleProof, BigInt(wrongPosition), leafHash),
      )
      .attach.SpendingValidator(validator)
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: newInitialState },
        assetsToInitialize,
      )
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: State.PreparedPublicKeyChunk(BigInt(wrongPosition), publicKeyChunk) },
        { [unitToSpend]: 1n },
      )

      await assertRejects(incomplete.complete, "Bad because the position is wrong")
  });

  await t.step("Wrong public key chunk", async () => {
    const wrongPublicKeyChunk = publicKeyParts[position + 1];
    const incomplete = lucid.newTx()
      .collectFrom(
        [uninitializedUtxo],
        SpendAction.InitializePublicKeyChunk(merkleProof, BigInt(position), leafHash),
      )
      .attach.SpendingValidator(validator)
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: newInitialState },
        assetsToInitialize,
      )
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: State.PreparedPublicKeyChunk(BigInt(position), wrongPublicKeyChunk) },
        { [unitToSpend]: 1n },
      )

      await assertRejects(incomplete.complete, "Bad because the public key chunk is wrong")
  });

  await t.step("bad -- shuffle the merkle proof", async () => {
    const badMerkleProof = structuredClone(merkleProof)
      .map(node => ({value: node, sort: Math.random()}))
      .sort((a, b) => a.sort - b.sort)
      .map(node => node.value);

    // sanity check
    assertEquals(badMerkleProof.length, merkleProof.length, "The length of the shuffled merkle proof should be the same as the original");

    const incomplete = lucid.newTx()
      .collectFrom(
        [uninitializedUtxo],
        SpendAction.InitializePublicKeyChunk(badMerkleProof, BigInt(position), leafHash),
      )
      .attach.SpendingValidator(validator)
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: newInitialState },
        assetsToInitialize,
      )
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: State.PreparedPublicKeyChunk(BigInt(position), publicKeyChunk) },
        { [unitToSpend]: 1n },
      )

      // await incomplete.complete();
      await assertRejects(incomplete.complete, "Bad because the merkle proof is wrong (shuffled)")
  });

  // finally we will actually initialize the tokens
  await t.step("Initialize the tokens", async () => {
    const assetsToInitialize = structuredClone(assetsToMint);
    const initialize = async (position: number) => {
        assert(position >= 0, "Position must be greater than or equal to 0");
        assert(position < 8, "Position must be less than 8");

        const scriptUtxos = await lucid.utxosAt(scriptAddress);
        // assert(scriptUtxos.length === 1 + position, "Unxpected number of script utxos");
        assertExists(testState.msLamport, "The msLamport should be initialized at this point in the test");
        const merkleRoot = await testState.msLamport.publicKeyMerkleRoot();
        const merkleProof: ProofNode[] = testState.msLamport.publicKeyMerkleProof(position);
        const leafHash = testState.msLamport.chunkLeafHash(position);

        const newInitialState = State.Initial(8n - (BigInt(position) + 1n), merkleRoot);
        const unitToSpend = policyId + fromText(`${position + 1}`);
        
        assertExists(assetsToInitialize, "The assetsToInitialize should be initialized at this point in the test");
        delete assetsToInitialize[unitToSpend];
        // console.log(`%cAssets to initialize after this one: ${JSON.stringify(Object.keys(testState.assetsToInitialize), null, 2)}`, "color: pink");
      
        const publicKeyParts = await testState.msLamport.publicKeyParts();
        const publicKeyChunk = publicKeyParts[position];

        // find the script utxo with the uninitialized tokens
        const uninitializedUtxo = scriptUtxos.find((utxo) => {
          // we'll know its the right one because the datum should match the expected value
          const expectedDatum : string = State.Initial(8n - (BigInt(position)), merkleRoot); 
          return utxo.datum === expectedDatum;
        })

        assertExists(uninitializedUtxo, "should have found the uninitialized tokensutxo");

        console.log("%cAbout to build the tx", "color: cyan")
        const tx = await lucid.newTx()
          .collectFrom(
            [uninitializedUtxo],
            SpendAction.InitializePublicKeyChunk(merkleProof, BigInt(position), leafHash),
          )
          .attach.SpendingValidator(validator)
          .pay.ToContract(
            scriptAddress,
            { kind: "inline", value: newInitialState },
            assetsToInitialize,
          )
          .pay.ToContract(
            scriptAddress,
            { kind: "inline", value: State.PreparedPublicKeyChunk(BigInt(position), publicKeyChunk) },
            { [unitToSpend]: 1n },
          )
          .complete();

        const signed = await tx.sign.withWallet().complete();
        const txHash = await signed.submit();

        await lucid.awaitTx(txHash);
      };

      await initialize(0);
      await initialize(1);
      await initialize(2);
      await initialize(3);
      await initialize(4);
      await initialize(5);
      await initialize(6);
      await initialize(7);
    });

});

Deno.test("Bad ways to sign (post signature on-chain)", async (t) => {
  assertExists(testState.msLamport, "The msLamport should be initialized at this point in the test");
  console.log(`Message:      ${testState.message}`);
  assertExists(testState.message, "The message should be initialized at this point in the test");
  const message = new TextEncoder().encode(testState.message);

  const signatureParts = await testState.msLamport.signToParts(message);
  const publicKeyParts = await testState.msLamport.publicKeyParts();
  assert(await MultiStepLamport.verifyFromParts(message, signatureParts, publicKeyParts), "The signature should be valid");

  const messageHash = await sha256(message);
  console.log(`Message hash: ${toHex(messageHash)}`);
  const position = 0;
  const scriptUtxos = await lucid.utxosAtWithUnit(scriptAddress, policyId + fromText(`${position + 1}`));
  assertEquals(scriptUtxos.length, 1, "There should be 1 utxo on the script address at this point in the test");
    
  const messageHashChunk = messageHash.slice(position * 4, (position + 1) * 4);
  console.log(`Message hash chunk ${position}: ${toHex(messageHashChunk)}`);

  await t.step("how to actually post a signature chunk", async () => {
    const incomplete = lucid.newTx()
      .collectFrom(
        scriptUtxos,
        SpendAction.VerifySignatureChunk(signatureParts[position]),
      )
      .attach.SpendingValidator(validator)
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: State.SignedMessageChunk(BigInt(position), messageHashChunk) },
        { [policyId + fromText(`${position + 1}`)]: 1n },
      )

      await incomplete.complete()
  });

  await t.step("wrong order", async () => {
    // try to do second chunk before the first
    const wrongPosition = 1;
    const incomplete = lucid.newTx()
      .collectFrom(
        scriptUtxos,
        SpendAction.VerifySignatureChunk(signatureParts[wrongPosition]),
      )
      .attach.SpendingValidator(validator)
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: State.SignedMessageChunk(BigInt(wrongPosition), messageHashChunk) },
        { [policyId + fromText(`${wrongPosition + 1}`)]: 1n },
      )

    await assertRejects(incomplete.complete, "Bad because the position is wrong")
  });

  await t.step("provide wrong message chunk", async () => {
    const wrongPosition = position + 1;
    const wrongMessageHashChunk = messageHash.slice(wrongPosition * 4, (wrongPosition + 1) * 4);

    const incomplete = lucid.newTx()
      .collectFrom(
        scriptUtxos,
        SpendAction.VerifySignatureChunk(signatureParts[position]),
      )
      .attach.SpendingValidator(validator)
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: State.SignedMessageChunk(BigInt(position), wrongMessageHashChunk) },
        { [policyId + fromText(`${position + 1}`)]: 1n },
      )

    await assertRejects(incomplete.complete, "Bad because the position is wrong")
    // await incomplete.complete()
  });

  await t.step("provide wrong signature part", async () => {
    const wrongSignaturePart = signatureParts[position + 1];
    const incomplete = lucid.newTx()
      .collectFrom(
        scriptUtxos,
        SpendAction.VerifySignatureChunk(wrongSignaturePart),
      )
      .attach.SpendingValidator(validator)
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: State.SignedMessageChunk(BigInt(position), messageHashChunk) },
        { [policyId + fromText(`${position + 1}`)]: 1n },
      )

    await assertRejects(incomplete.complete, "Bad because the signature part is wrong")
  });

  await t.step("provide wrong signature part - flip a single bit in the signature ", async () => {
    // const wrongSignaturePart = signatureParts[position];
    const wrongSignaturePart = flipBitInSignature(signatureParts[position], 9);
    const incomplete = lucid.newTx()
      .collectFrom(
        scriptUtxos,
        SpendAction.VerifySignatureChunk(wrongSignaturePart),
      )
      .attach.SpendingValidator(validator)
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: State.SignedMessageChunk(BigInt(position), messageHashChunk) },
        { [policyId + fromText(`${position + 1}`)]: 1n },
      )

    await assertRejects(incomplete.complete, "Bad because the signature part is wrong")
    // await incomplete.complete()
  });

  await t.step("signature is reversed", async () => {
    const reversedSignaturePart = signatureParts[position].toReversed();
    const incomplete = lucid.newTx()
      .collectFrom(
        scriptUtxos,
        SpendAction.VerifySignatureChunk(reversedSignaturePart),
      )
      .attach.SpendingValidator(validator)
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: State.SignedMessageChunk(BigInt(position), messageHashChunk) },
        { [policyId + fromText(`${position + 1}`)]: 1n },
      )

      // await incomplete.complete()
      await assertRejects(incomplete.complete, "Bad because the signature part is wrong (reversed)")
  });

  const postSignaturePart = async (position: number) => {
    assert(position >= 0, "Position must be greater than or equal to 0");
    assert(position < 8, "Position must be less than 8");

    const scriptUtxos = await lucid.utxosAtWithUnit(scriptAddress, policyId + fromText(`${position + 1}`));
    assertEquals(scriptUtxos.length, 1, "There should be 1 utxo on the script address at this point in the test");

    const messageHashChunk = messageHash.slice(position * 4, (position + 1) * 4);
    console.log(`Message hash chunk ${position}: ${toHex(messageHashChunk)}`);

    const tx = await lucid.newTx()
      .collectFrom(
        scriptUtxos,
        SpendAction.VerifySignatureChunk(signatureParts[position]),
      )
      .attach.SpendingValidator(validator)
      .pay.ToContract(
        scriptAddress,
        { kind: "inline", value: State.SignedMessageChunk(BigInt(position), messageHashChunk) },
        { [policyId + fromText(`${position + 1}`)]: 1n },
      )
      .complete();

    const signed = await tx.sign.withWallet().complete();
    const txHash = await signed.submit();

    await lucid.awaitTx(txHash);
  }

  await postSignaturePart(0);
  await postSignaturePart(1);
  await postSignaturePart(2);
  await postSignaturePart(3);
  await postSignaturePart(4);
  await postSignaturePart(5);
  await postSignaturePart(6);
  await postSignaturePart(7);
});

Deno.test("Bad ways to Spend the tokens and verify the message", async (t) => {
  const scriptUtxos = await lucid.utxosAt(scriptAddress).then(
    utxos => utxos.filter(
      utxo => Object.keys(utxo.assets).some((asset) => asset.startsWith(policyId))
    ));
  
  assertEquals(scriptUtxos.length, 8, "There should be 8 utxos on the script address at this point in the test");
  assertExists(testState.message, "The message should be initialized at this point in the test");

  const message = new TextEncoder().encode(testState.message);

  // const assetsToBurn = ["1", "2", "3", "4", "5", "6", "7", "8"]
  const assetsToBurn = Array.from({length: 8}, (_, index) => `${1 + index}` ) 
    .map(unit => policyId + fromText(unit))
    .reduce((acc, unit) => ({ ...acc, [unit]: -1n }), {});

  await t.step("successful example", async () => {
    const incomplete = lucid.newTx()
      .collectFrom(scriptUtxos, SpendAction.VerifyFullSignature(message))
      .attach.SpendingValidator(validator)
      .attach.MintingPolicy(mintingPolicy)
      .mintAssets(assetsToBurn, MintAction.Burn)
    
      await incomplete.complete()
  });

  await t.step("wrong message in redeemer", async () => {
    const wrongMessage = new TextEncoder().encode("this is the wrong message");
    const incomplete = lucid.newTx()
      .collectFrom(scriptUtxos, SpendAction.VerifyFullSignature(wrongMessage))
      .attach.SpendingValidator(validator)
      .attach.MintingPolicy(mintingPolicy)
      .mintAssets(assetsToBurn, MintAction.Burn)
    
      await assertRejects(incomplete.complete, "Bad because the message is wrong")
  });

  await t.step("must burn the tokens", async () => {
    const incomplete = lucid.newTx()
      .collectFrom(scriptUtxos, SpendAction.VerifyFullSignature(message))
      .attach.SpendingValidator(validator)
    
      await assertRejects(incomplete.complete, "Bad because the tokens are not burned")
  });

  await t.step("must not create new tokens", async () => {
    const assetsToBurnWithSneaky = {
      ...assetsToBurn,
      [policyId + fromText(`sneaky token`)]: 1n,
    }
    const incomplete = lucid.newTx()
      .collectFrom(scriptUtxos, SpendAction.VerifyFullSignature(message))
      .attach.SpendingValidator(validator)
      .attach.MintingPolicy(mintingPolicy)
      .mintAssets(assetsToBurnWithSneaky, MintAction.Burn)
    
      await assertRejects(incomplete.complete, "Bad because some random token is created")
  });

  // actually do it.. verify the message and burn the tokens
  const tx = await lucid.newTx()
    .collectFrom(scriptUtxos, SpendAction.VerifyFullSignature(message))
    .attach.SpendingValidator(validator)
    .attach.MintingPolicy(mintingPolicy)
    .mintAssets(assetsToBurn, MintAction.Burn)
    .complete();

  const signed = await tx.sign.withWallet().complete();
  const txHash = await signed.submit();

  await lucid.awaitTx(txHash);

  // expect that neither the script address nor the wallet address have any assets with the policy id
  const assertNoAssetsFromPolicy = async (address: string) => {
    const utxos = await lucid.utxosAt(address)
    const assets = utxos.flatMap(utxo => Object.keys(utxo.assets))
    console.log(`%cAssets on ${address}: ${JSON.stringify(assets, null, 2)}`, "color: hotpink")
    for (const asset of assets) {
      assert(!asset.startsWith(policyId), `The asset ${asset} should not start with the policy id`);
    }
  }

  await assertNoAssetsFromPolicy(scriptAddress);
  await assertNoAssetsFromPolicy(await lucid.wallet().address());
});