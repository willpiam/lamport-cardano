

export function flipSingleBitInChunk(chunk: Uint8Array, bitPosition: number): Uint8Array {
  const copy = new Uint8Array(chunk);
  const byteIndex     = Math.floor(bitPosition / 8);
  const bitIndexInByte = bitPosition % 8;
  // build the mask: MSB-first inside each byte
  const mask = 1 << (7 - bitIndexInByte);
  copy[byteIndex] ^= mask;
  return copy;
}

export function flipBitInSignature(
  signature: Uint8Array[],
  globalBitIndex: number
): Uint8Array[] {
  // 1) Find which chunk the bit lives in
  let bitsScanned = 0;
  let targetChunk = -1;
  let localBitPos = 0;

  for (let i = 0; i < signature.length; i++) {
    const chunkBits = signature[i].length * 8;
    if (globalBitIndex < bitsScanned + chunkBits) {
      targetChunk = i;
      localBitPos = globalBitIndex - bitsScanned;
      break;
    }
    bitsScanned += chunkBits;
  }

  if (targetChunk < 0) {
    throw new RangeError(`Bit index ${globalBitIndex} is out of range.`);
  }

  // 2) Map, flipping just that one bit in the identified chunk
  return signature.map((chunk, idx) =>
    idx === targetChunk
      ? flipSingleBitInChunk(chunk, localBitPos)
      : chunk
  );
}

export const toBinaryString = (arr: Uint8Array[]) => arr.map((bytes) => Array.from(bytes).map((b) => b.toString(2).padStart(8, "0")).join("")).join("");

export const binaryStringXor = (a: string, b: string) => {
  const aBytes = a.split("").map(Number);
  const bBytes = b.split("").map(Number);
  return aBytes.map((a, i) => a ^ bBytes[i]).join("");
};

export const burn = async (lucid: any, mintingPolicy: any, unit: string, amount: bigint) => {
  const tx = await lucid
    .newTx()
    .attach.MintingPolicy(mintingPolicy)
    .mintAssets({
      [unit]: -amount,
    })
    .complete();

  const signed = await tx.sign.withWallet().complete();
  const txHash = await signed.submit();

  return txHash;
}