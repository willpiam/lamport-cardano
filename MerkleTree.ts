import { assert } from "@std/assert";
import { sha256 } from "./sha256.ts";
import { toHex } from "npm:@blaze-cardano/core";

/**
 * Simple utility to concatenate two Uint8Arrays.
 */
function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

/**
 * A single node in a Merkle proof, containing the sibling hash
 * and a flag indicating whether that sibling is to the left of the node.
 */
export interface ProofNode {
  hash: Uint8Array;
  siblingOnLeft: boolean;
}

/**
 * Merkle tree where **constructor data are already leaf hashes**.
 * `layers[layers.length‑1]` = leaf hashes,
 * `layers[0]`            = Merkle root (length === 1 after build()).
 */
export class MerkleTree {
  private data: Uint8Array[];
  private layers: Uint8Array[][] = [];

  constructor(hashedLeaves: Uint8Array[]) {
    assert(hashedLeaves.length > 0, "Data array must not be empty");
    this.data = hashedLeaves.slice();
  }

  getLeafAt(index: number): Uint8Array {
    return this.data[index];
  }

  /** Number of leaves supplied to the constructor. */
  get leafCount(): number {
    return this.data.length;
  }

  /** Builds the tree, treating `data` as pre‑computed leaf hashes. */
  async build(): Promise<void> {
    assert(this.layers.length === 0, "Tree has already been built");

    // First layer is the leaf layer (pre‑hashed).
    let current = this.data.slice();
    this.layers.push(current);

    // Iteratively build parent layers until a single root remains.
    while (current.length > 1) {
      // If odd, duplicate the last element.
      if (current.length % 2 === 1) {
        current.push(current[current.length - 1]);
      }

      const nextLayer = await Promise.all(
        current.reduce<Promise<Uint8Array>[]>((acc, _, i) => {
          if (i % 2 === 0) {
            acc.push(sha256(concat(current[i], current[i + 1])));
          }
          return acc;
        }, []),
      );

      // Prepend parents so that layers[0] is always the root.
      this.layers.unshift(nextLayer);
      current = nextLayer;
    }
  }

  /** Returns the Merkle root. Requires `build()` to have run. */
  getRoot(): Uint8Array {
    assert(this.layers.length > 0, "Tree not built");
    assert(this.layers[0].length === 1, "Expected exactly one root hash");
    return this.layers[0][0];
  }

  /**
   * Computes the Merkle proof for a leaf at `index`.
   * Each ProofNode gives the sibling hash and whether that sibling was on the left.
   */
  getProofByIndex(index: number): ProofNode[] {
    assert(this.layers.length > 0, "Tree not built");
    assert(index >= 0 && index < this.data.length, "Index out of range");

    const proof: ProofNode[] = [];
    let idx = index;

    // Walk up from leaves (last layer) to root (first layer).
    for (let layer = this.layers.length - 1; layer > 0; layer--) {
      const siblings = this.layers[layer];

      if (idx === siblings.length - 1 && siblings.length % 2 === 1) {
        // Odd count: last node was duplicated, sibling is itself.
        proof.push({ hash: siblings[idx], siblingOnLeft: false });
      } else {
        const pairIndex = idx % 2 === 0 ? idx + 1 : idx - 1;
        const siblingOnLeft = pairIndex < idx;
        proof.push({ hash: siblings[pairIndex], siblingOnLeft });
      }

      idx = Math.floor(idx / 2);
    }

    return proof;
  }

  /**
   * Convenience lookup: finds a **leaf hash** in the original data and returns its proof.
   * Pass the exact hash you supplied to the constructor.
   */
  getProofByLeafHash(leafHash: Uint8Array): ProofNode[] {
    const leafLayer = this.layers[this.layers.length - 1];
    const idx = leafLayer.findIndex((h) => toHex(h) === toHex(leafHash));
    assert(idx !== -1, "Leaf hash not found");
    return this.getProofByIndex(idx);
  }

  /**
   * Verifies that a leaf hash is included under `root` given its `proof`.
   * `leafHash` must be the same hash stored in the tree’s leaf layer.
   */
  // async verifyProof(
  //   leafHash: Uint8Array,
  //   proof: ProofNode[],
  //   root: Uint8Array
  // ): Promise<boolean> {
  //   let hash = leafHash;

  //   for (const { hash: siblingHash, siblingOnLeft } of proof) {
  //     hash = siblingOnLeft
  //       ? await sha256(concat(siblingHash, hash))
  //       : await sha256(concat(hash, siblingHash));
  //   }

  //   return toHex(hash) === toHex(root);
  // }
  async verifyProof(
    leafHash: Uint8Array,
    proof: readonly ProofNode[],
    root: Uint8Array,
  ): Promise<boolean> {
    // Inner tail‑recursive helper
    const compute = async (
      current: Uint8Array,
      remaining: readonly ProofNode[],
    ): Promise<Uint8Array> => {
      if (remaining.length === 0) {
        return current; // recursion base‑case: reached the root
      }

      const [{ hash: sibling, siblingOnLeft }, ...rest] = remaining;

      const parent = siblingOnLeft
        ? await sha256(concat(sibling, current))
        : await sha256(concat(current, sibling));

      return compute(parent, rest); // recurse with the newly‑derived hash
    };

    const derivedRoot = await compute(leafHash, proof);
    return toHex(derivedRoot) === toHex(root);
  }
}
