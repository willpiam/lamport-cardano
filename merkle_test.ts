import { assert, assertEquals } from "@std/assert";
import { sha256 } from "./sha256.ts";
import { toHex } from "npm:@blaze-cardano/core";
import { MerkleTree, concat } from "./MerkleTree.ts";

// Helper to create Uint8Array from string
const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

Deno.test("MerkleTree – single leaf root equals the leaf itself", async () => {
  const leaf = await sha256(encode("a"));
  const tree = new MerkleTree([leaf]);
  await tree.build();
  const root = tree.getRoot();
  assertEquals(toHex(root), toHex(leaf));

  // Proof for the only leaf should be empty and verification should succeed
  const proof = tree.getProofByIndex(0);
  assertEquals(proof.length, 0);
  const valid = await tree.verifyProof(leaf, proof, root);
  assert(valid, "Proof for single leaf should verify");
});

Deno.test("MerkleTree – two leaves produces correct root and proofs verify", async () => {
  const leaf1 = await sha256(encode("a"));
  const leaf2 = await sha256(encode("b"));
  const expectedRoot = await sha256(concat(leaf1, leaf2));

  const tree = new MerkleTree([leaf1, leaf2]);
  await tree.build();
  const root = tree.getRoot();
  assertEquals(toHex(root), toHex(expectedRoot), "Root should equal manual calculation");

  for (const [idx, leaf] of [leaf1, leaf2].entries()) {
    const proof = tree.getProofByIndex(idx);
    const ok = await tree.verifyProof(leaf, proof, root);
    assert(ok, `Proof for leaf ${idx} should verify`);
  }
});

Deno.test("MerkleTree – odd number of leaves (3) duplicates last leaf and proofs verify", async () => {
  const leaves = ["a", "b", "c"];
  const hashedLeaves = await Promise.all(leaves.map((s) => sha256(encode(s))));
  const tree = new MerkleTree(hashedLeaves);
  await tree.build();
  const root = tree.getRoot();

  // Verify each leaf using generated proofs
  for (let i = 0; i < hashedLeaves.length; i++) {
    const proof = tree.getProofByIndex(i);
    const ok = await tree.verifyProof(hashedLeaves[i], proof, root);
    assert(ok, `Proof for leaf ${i} should verify`);
  }
});

Deno.test("MerkleTree – tampering with proof causes verification failure", async () => {
  const leaves = ["x", "y", "z", "w"];
  const hashedLeaves = await Promise.all(leaves.map((s) => sha256(encode(s))));
  const tree = new MerkleTree(hashedLeaves);
  await tree.build();
  const root = tree.getRoot();

  const targetIndex = 2; // leaf "z"
  const proof = tree.getProofByIndex(targetIndex);

  // Clone proof and tamper with first sibling hash
  const badProof = proof.map((node, idx) => {
    if (idx === 0) {
      const alteredHash = new Uint8Array(node.hash);
      alteredHash[0] ^= 0xff; // flip first byte
      return {
        hash: alteredHash,
        siblingOnLeft: node.siblingOnLeft,
      };
    }
    return node;
  });

  const okOriginal = await tree.verifyProof(hashedLeaves[targetIndex], proof, root);
  assert(okOriginal, "Original proof must verify");
  const okTampered = await tree.verifyProof(hashedLeaves[targetIndex], badProof, root);
  assert(!okTampered, "Tampered proof should fail verification");
});

Deno.test("MerkleTree – getProofByLeafHash returns same proof as getProofByIndex", async () => {
  const leaves = ["foo", "bar", "baz"];
  const hashed = await Promise.all(leaves.map((s) => sha256(encode(s))));
  const tree = new MerkleTree(hashed);
  await tree.build();

  for (let i = 0; i < hashed.length; i++) {
    const proofByIndex = tree.getProofByIndex(i);
    const proofByHash = tree.getProofByLeafHash(hashed[i]);
    assertEquals(proofByIndex, proofByHash, `Proofs for leaf ${i} should match`);
  }
}); 