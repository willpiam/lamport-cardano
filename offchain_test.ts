// test_lamport.ts
import { assert } from "https://deno.land/std@0.202.0/assert/mod.ts";
import { Lamport, generateSeed, validateKey } from "./Lamport.ts";
import { assertEquals } from "@std/assert/equals";

const keyStrength = 256;

Deno.test("Lamport signature - correct usage passes", async () => {
  // 1. Generate a seed
  const seed = await generateSeed(); // 32 random bytes
  
  // 2. Create lamport instance with a smaller keyStrength for test
  const lamport = new Lamport(seed, keyStrength);

  // 3. Create a message, sign it
  const message = new TextEncoder().encode("Hello, Lamport!");
  const signature = await lamport.sign(message);

  // 4. Generate the public key
  const publicKey = await lamport.publicKey();

  // 5. Verify the signature
  const isValid = await Lamport.verify(message, signature, publicKey, keyStrength);
  assert(isValid, "Signature should be valid for the correct message");
});

Deno.test("Lamport signature - wrong message fails", async () => {
  const seed = await generateSeed();
  const lamport = new Lamport(seed, keyStrength);

  const message = new TextEncoder().encode("Hello, Lamport!");
  const signature = await lamport.sign(message);
  const publicKey = await lamport.publicKey();

  // Construct a different message
  const wrongMessage = new TextEncoder().encode("This is the wrong message");
  const isValid = await Lamport.verify(wrongMessage, signature, publicKey, keyStrength);
  assert(!isValid, "Signature should be invalid if the message is changed");
});

Deno.test("Lamport signature - altered signature fails", async () => {
  const seed = await generateSeed();
  const lamport = new Lamport(seed, keyStrength);

  const message = new TextEncoder().encode("Hello, Lamport!");
  const signature = await lamport.sign(message);
  const publicKey = await lamport.publicKey();

  // Alter the first byte of the first signature piece
  const alteredSignature = signature.map((piece, index) => {
    if (index === 0) {
      // clone the piece so we don't mutate the original
      const clone = new Uint8Array(piece);
      clone[0] = clone[0] ^ 0xff; // flip some bits
      return clone;
    }
    return piece;
  });

  const isValid = await Lamport.verify(message, alteredSignature, publicKey, keyStrength);
  assert(!isValid, "Signature should be invalid if we alter any piece of it");
});


Deno.test("To and from JSON", async () => {
  const seed = await generateSeed();
  const lamport = new Lamport(seed, keyStrength);
  // sign a message
  const message = new TextEncoder().encode(`Hello, Lamport! ${Date.now()}`);
  const signature = await lamport.sign(message);
  const publicKey = await lamport.publicKey();
  assert(validateKey(publicKey, keyStrength), "Public key should be valid");
  const isAuthentic = await Lamport.verify(message, signature, publicKey, keyStrength);
  assert(isAuthentic, "Should be able to verify a message");

  const json = lamport.toJSON();

  const lamport2 = Lamport.fromJSON(json);
  const signature2 = await lamport2.sign(message);
  assertEquals(signature, signature2, "Signatures on same message should be equal");
  const publicKey2 = await lamport2.publicKey();
  assertEquals(publicKey, publicKey2, "Public keys should be equal");
  const isAuthentic2 = await Lamport.verify(message, signature2, publicKey2, keyStrength);
  assert(isAuthentic2, "Should be able to verify a message from JSON");
});

Deno.test("Private keys make sense", async () => {
  const seed = await generateSeed();
  const lamport = new Lamport(seed, keyStrength);
  const privateKey = await lamport.privateKey();
  assert(validateKey(privateKey, keyStrength), "Private key should be valid");
});