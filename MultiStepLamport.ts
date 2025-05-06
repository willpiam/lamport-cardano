import { toHex } from "npm:@blaze-cardano/core";
import { Lamport, LamportKey, LamportPrivateKey, LamportPublicKey, LamportSignature } from "./Lamport.ts";
import { MerkleTree, ProofNode } from "./MerkleTree.ts";
import { sha256 } from "./sha256.ts";
type LamportSignatureChunk = LamportSignature; 
type LamportKeyChunk = LamportKey;
type LamportPublicKeyChunk = LamportPublicKey;
type LamportPrivateKeyChunk = LamportPrivateKey;


const breakSignatureIntoChunks = (signature : LamportSignature) : LamportSignatureChunk[] => Array.from({ length: 8 }, (_, i) : Uint8Array[] => signature.slice(i * 32, (i + 1) * 32));

const breakKeyIntoChunks = (key : LamportKey) : LamportKeyChunk[] => Array.from({ length: 8 }, (_, i) : [Uint8Array[], Uint8Array[]] => {
    const left : Uint8Array[] = key[0].slice(i * 32, (i + 1) * 32);
    const right : Uint8Array[]= key[1].slice(i * 32, (i + 1) * 32);
    return [left, right];
});

const concatMany = (elements : Uint8Array[]) : Uint8Array => {
    const length = elements.reduce((acc, curr) => acc + curr.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const element of elements) {
        result.set(element, offset);
        offset += element.length;
    }
    return result;
}
/*
    Lamport scheme which can be broken into 8 steps
*/
class MultiStepLamport extends Lamport {
  private publicKeyMerkleTree: MerkleTree | null;

  constructor(initialSecret: Uint8Array) {
    super(initialSecret, 256);
    this.publicKeyMerkleTree = null;
  }

  async privateKeyParts(): Promise<LamportPrivateKeyChunk[]> {
    const privateKey = await super.privateKey();
    return breakKeyIntoChunks(privateKey);
  }

  async publicKeyParts(): Promise<LamportPublicKeyChunk[]> {
    const publicKey = await super.publicKey();
    return breakKeyIntoChunks(publicKey);
  }

  async signToParts(message: Uint8Array): Promise<LamportSignatureChunk[]> {
    const signature = await super.sign(message);
    return breakSignatureIntoChunks(signature);
  }

  publicKeyMerkleProof(index : number): ProofNode[] {
    if (this.publicKeyMerkleTree === null) {
      throw new Error("Merkle tree does not yet exist");
    }

    return this.publicKeyMerkleTree.getProofByIndex(index);
  }

  chunkLeafHash(index : number): Uint8Array {
    if (this.publicKeyMerkleTree === null) {
      throw new Error("Merkle tree does not yet exist");
    }

    return this.publicKeyMerkleTree.getLeafAt(index);
  }

  /*

  */
  async publicKeyMerkleRoot(): Promise<Uint8Array> {
    if (this.publicKeyMerkleTree !== null) {
        return this.publicKeyMerkleTree.getRoot();
    }

    const publicKeyParts = await this.publicKeyParts();
    const publicKeyPartsHashes = [] as Uint8Array[];        // leafs

    for (let i = 0; i < 8; i++) {
        const part : LamportKeyChunk = publicKeyParts[i];
        const flat = concatMany(part.flat());

        const hash = await sha256(flat);
        publicKeyPartsHashes.push(hash);
    }

    console.log(`Public key parts hashes:`);
    publicKeyPartsHashes.forEach(hash => console.log(toHex(hash)));

    this.publicKeyMerkleTree = new MerkleTree(publicKeyPartsHashes);
    await this.publicKeyMerkleTree.build();
    return this.publicKeyMerkleTree.getRoot();
  }

  static async verifyFromParts(message: Uint8Array, signature: LamportSignatureChunk[], publicKeyParts: LamportPublicKeyChunk[]): Promise<boolean> {
    const flatSignature : LamportSignature = signature.flat()
    const flatPublicKey : LamportPublicKey = publicKeyParts.reduce(
        (acc, curr) => [[...acc[0], ...curr[0]], [...acc[1], ...curr[1]]],
        [[], []] 
    );
    return await Lamport.verify(message, flatSignature, flatPublicKey, 256)
  }
}

export {
    type LamportSignatureChunk,
    type LamportKeyChunk,
    type LamportPublicKeyChunk,
    type LamportPrivateKeyChunk,
    MultiStepLamport
};
