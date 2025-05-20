
use merkle.{ProofNode, verify_merkle_proof}

pub type SpendAction {
  InitializePublicKeyChunk (List<ProofNode>, Int, ByteArray) // merkle proof, position, leaf hash
  VerifySignatureChunk (List<ByteArray>) // signature chunk
  VerifyFullSignature (ByteArray) // message
}