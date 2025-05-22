import { Constr, Data } from "npm:@lucid-evolution/lucid";
import { toHex } from "npm:@blaze-cardano/core";
import { ProofNode } from "./MerkleTree.ts";
import { LamportPublicKeyChunk } from "./MultiStepLamport.ts";

/*
  These constructs mirror the on-chain types
*/

export const MintAction = {
  Mint: Data.to(new Constr(0, [])),
  Burn: Data.to(new Constr(1, [])),
};

export const State = {
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

export const Bool = {
  False: new Constr(0, []),
  True: new Constr(1, []),
};

export const ProofNodeData = (proofNode: ProofNode) =>
  new Constr(0, [
    toHex(proofNode.hash),
    proofNode.siblingOnLeft ? Bool.True : Bool.False,
  ]);

export const SpendAction = {
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
