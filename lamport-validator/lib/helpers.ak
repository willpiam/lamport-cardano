use cardano/assets.{PolicyId, AssetName}
use merkle.{ProofNode}
use cardano/transaction.{InlineDatum, Output, Input}
use verify_lamport.{LamportPublicKey}
use aiken/collection/dict
use aiken/collection/list
use aiken/primitive/bytearray
use aiken/crypto.{sha2_256}


pub type SpendAction {
  InitializePublicKeyChunk (List<ProofNode>, Int, ByteArray) // merkle proof, position, leaf hash
  VerifySignatureChunk (List<ByteArray>) // signature chunk
  VerifyFullSignature (ByteArray) // message
}

pub type MintAction {
  Mint
  Burn
}

pub type PublicKeyChunk = LamportPublicKey

pub type State {
  Initial (Int, ByteArray) // tokens not initalized, public key merkle root
  PreparedPublicKeyChunk (Int, PublicKeyChunk) // position, chunk
  SignedMessageChunk (Int, ByteArray) // position, chunk
}

/// compare_signed_message_chunk
/// an ordering for SignedMessageChunks based on the Int (position) value 
/// used in: VerifyFullSignature 
pub fn compare_signed_message_chunk(left: State, right: State) -> Ordering {
  expect SignedMessageChunk(left_position, _) = left
  expect SignedMessageChunk(right_position, _) = right
  if left_position < right_position {
    Less
  } else if left_position > right_position {
    Greater
  } else {
    Equal
  }
}

/// find_output_with_asset
/// given a policy id, an asset name, and a list of outputs
/// return an output from the list which has the provided policy id and asset name
/// used in: InitializePublicKeyChunk, VerifySignatureChunk, VerifyFullSignature
pub fn find_output_with_asset(policy_id : PolicyId, asset_name : AssetName, outputs : List<Output>) -> Option<Output> {
  outputs
    |> list.find(
        fn(output) {
          let amount = output.value
            |> assets.tokens(policy_id)
            |> dict.get(asset_name)

          when amount is {
            Some(1) -> True
            _ -> False
          }
        },
      )
}


/// check_remaining_uninitialized
/// check that the remaining uninitialized tokens are 
/// in a single utxo with the expected datum
/// used in: InitializePublicKeyChunk 
pub fn check_remaining_uninitialized(
  outputs : List<Output>, 
  policy_id : PolicyId, 
  expected_asset_name : AssetName, 
  uninitialized_tokens_input : Input,
  original_merkle_root : ByteArray,
  original_tokens_not_initalized : Int,
   ) -> Bool {
  let outputs_with_policy_tokens = list.filter(outputs, fn(output) {
      False == (output.value 
        |> assets.tokens(policy_id) 
        |> dict.is_empty())
  })
  expect Some(remaining_uninitialized_output) = list.find(outputs_with_policy_tokens, fn(output) {
    // get the one that doesn't have the expected asset name
    0 == assets.quantity_of(output.value, policy_id, expected_asset_name)
  })
  expect InlineDatum(next_raw_uninitialized_datum) = remaining_uninitialized_output.datum
  expect Initial(tokens_not_initalized, public_key_merkle_root) = next_raw_uninitialized_datum

  and {
    // uninitialized tokens must go to same address
    remaining_uninitialized_output.address == uninitialized_tokens_input.output.address,
    // there must be 2 outputs with policy id tokens
    2 == list.length(outputs_with_policy_tokens),
    // counter on remaining uninitialized output must be 1 less than counter on input
    tokens_not_initalized == original_tokens_not_initalized - 1,
    // merkle root must be unchanged
    public_key_merkle_root == original_merkle_root,
  }
}


/// hash_chunk
/// reduce a PublickKeyChunk down to a single bytearray and hash it
/// used in: InitializePublicKeyChunk
pub fn hash_chunk(chunk : PublicKeyChunk) -> ByteArray {
  let chunk_elements = list.concat(chunk.pk_left, chunk.pk_right)
  let flat_chunk = list.reduce(chunk_elements, #[], fn(acc, curr) {
    bytearray.concat(acc, curr)
  })
  sha2_256(flat_chunk)
}