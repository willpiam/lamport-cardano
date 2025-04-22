// test_lamport.ts
import { assert } from "https://deno.land/std@0.202.0/assert/mod.ts";
import { Lamport, generateSeed } from "./Lamport.ts";

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
