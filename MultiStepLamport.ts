import { Lamport, LamportKey, LamportPrivateKey, LamportPublicKey, LamportSignature } from "./Lamport.ts";

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

/*
    Lamport scheme which can be broken into 8 steps
*/
class MultiStepLamport extends Lamport {
  constructor(initialSecret: Uint8Array) {
    super(initialSecret, 256);
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
