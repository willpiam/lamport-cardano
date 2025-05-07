use aiken/collection/dict.{Dict}
use aiken/collection/list
use cardano/assets.{PolicyId, AssetName}
use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction, Input}
use cardano/address.{Script}
use aiken/primitive/bytearray
use aiken/primitive/int
use aiken/builtin
use aiken/crypto.{sha2_256}
use verify_lamport.{LamportPublicKey, verify_lamport}

/// Verify a full lamport signature by breaking it into multiple pieces
/// this demo/experiment is a work in progress and not yet finished
pub type MintAction {
  Mint
  Burn
}

pub type ProofNode {
  hash: ByteArray,
  sibling_on_left: Bool,
}

pub fn recursive_verify_merkle_proof(current: ByteArray, remaining: List<ProofNode>) -> ByteArray {
  when list.is_empty(remaining) is {
    True -> current
    False -> {
      expect Some(head) = list.head(remaining)
      let ProofNode { hash: sibling, sibling_on_left } = head

      let parent = if sibling_on_left {
        sha2_256(bytearray.concat(sibling, current))
      } else {
        sha2_256(bytearray.concat(current, sibling))
      }

      expect Some(rest) = list.tail(remaining)
      recursive_verify_merkle_proof(parent, rest)
    }
  }
}

pub fn verify_merkle_proof(root: ByteArray, proof: List<ProofNode>, leaf_hash: ByteArray) -> Bool {
  let derived_root = recursive_verify_merkle_proof(leaf_hash, proof)
  root == derived_root
}

// pub type MintRedeemer {
//   action: MintAction,
//   root: ByteArray,
// }

pub type SpendAction {
  InitializePublicKeyChunk {merkle_proof: List<ProofNode>, position: Int, leaf_hash: ByteArray}
  VerifySignatureChunk (List<ByteArray>)
  VerifyFullSignature
}

// pub type SpendRedeemer {
//   action: SpendAction,
// }
// pub type PublicKeyChunk {
//   pk_left: List<ByteArray>,
//   pk_right: List<ByteArray>,
// }
pub type PublicKeyChunk = LamportPublicKey

pub type State {
  Initial {tokens_not_initalized: Int, public_key_merkle_root: ByteArray}
  PreparedPublicKeyChunk (Int, PublicKeyChunk) // position, chunk
  SignedMessageChunk (Int, ByteArray) // position, chunk
  Default
}

pub fn find_output_with_tokens(
  policy_id: PolicyId,
  outputs: List<Output>,
) -> Option<Output> {
  outputs
    |> list.find(
        fn(output) {
          8 == (output.value
            |> assets.tokens(policy_id)
            |> dict.to_pairs()
            |> list.length())
        },
      )
}

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

pub fn has_expected_names_and_amounts(minted_tokens: Dict<AssetName, Int>) -> Bool {
  /// names must be '1', '2', '3', '4', '5', '6', '7', '8'
  and {
    dict.get(minted_tokens, "1") == Some(1),
    dict.get(minted_tokens, "2") == Some(1),
    dict.get(minted_tokens, "3") == Some(1),
    dict.get(minted_tokens, "4") == Some(1),
    dict.get(minted_tokens, "5") == Some(1),
    dict.get(minted_tokens, "6") == Some(1),
    dict.get(minted_tokens, "7") == Some(1),
    dict.get(minted_tokens, "8") == Some(1),
  }
}

const eight = bytearray.from_string(int.to_string(8))

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
    list.length(outputs_with_policy_tokens) == 2,
    // counter on remaining uninitialized output must be 1 less than counter on input
    tokens_not_initalized == original_tokens_not_initalized - 1,
    // merkle root must be unchanged
    public_key_merkle_root == original_merkle_root,
  }
}

pub fn hash_chunk(chunk : PublicKeyChunk) -> ByteArray {
  let chunk_elements = list.concat(chunk.pk_left, chunk.pk_right)
  let flat_chunk = list.reduce(chunk_elements, #[], fn(acc, curr) {
    bytearray.concat(acc, curr)
  })
  sha2_256(flat_chunk)
}

validator manysteplamport(_version: Int) {
  spend(
    datum: Option<State>,
    action: SpendAction,
    target_input_reference: OutputReference,
    self: Transaction,
  ) {
    let Transaction { inputs, outputs, .. } = self
    expect Some(state) = datum

    when action is {
      InitializePublicKeyChunk { merkle_proof, position, leaf_hash } -> {
        // send 1 token back to this validator on an output with a public key chunk which fits in the merkle tree
        // send the rest of the tokens to the same validator but on a single output

        // find the policy id
        expect Some(uninitialized_tokens_input) = inputs |> list.find(fn(input) { input.output_reference == target_input_reference })
        expect Script(locked_script) = uninitialized_tokens_input.output.address.payment_credential
        let policy_id = locked_script

        expect Initial(tokens_not_initalized, public_key_merkle_root) = state 
     
        // find the output with the initialized token
        let expected_asset_name = bytearray.from_string(int.to_string(position + 1))
        expect Some(initialized_output) = find_output_with_asset(policy_id, expected_asset_name, outputs)
        expect InlineDatum(initialized_datum) = initialized_output.datum
        expect PreparedPublicKeyChunk (chunk_position, chunk) = initialized_datum

        let chunk_elements = list.concat(chunk.pk_left, chunk.pk_right)

        and {
          // leaf_hash must be the hash of the chunk
          leaf_hash == hash_chunk(chunk),
          // validate merkle proof
          verify_merkle_proof(public_key_merkle_root, merkle_proof, leaf_hash),
          // the initialized output must be on the same address (this validator)
          initialized_output.address == uninitialized_tokens_input.output.address,
          // chunk is the expected shape
          list.length(chunk.pk_left) == 32,
          list.length(chunk.pk_right) == 32,
          // all chunk elements must be unique
          list.length(list.unique(chunk_elements)) == list.length(chunk_elements),
          // position is correctly specified
          tokens_not_initalized == 8 - position, 
          // chunk position must be accurate
          chunk_position == position,
          // if we should have a new uninitialized output -> check for it
          if position != 7 {
            check_remaining_uninitialized(outputs, policy_id, expected_asset_name, uninitialized_tokens_input, public_key_merkle_root, tokens_not_initalized)
          } else {
            True
          }
        }
      }
      VerifySignatureChunk(signature_chunk) -> {
        // verify a chunk of a signature against a chunk of the message hash and a chunk of the public key
        expect PreparedPublicKeyChunk (pubkey_chunk_position, pubkey_chunk) = state

        expect Some(public_key_chunk_input) = inputs |> list.find(fn(input) { input.output_reference == target_input_reference })
        let expected_asset_name = bytearray.from_string(int.to_string(pubkey_chunk_position + 1))
        expect Script(policy_id) = public_key_chunk_input.output.address.payment_credential

        expect Some(output) = find_output_with_asset(policy_id, expected_asset_name, outputs)
        expect InlineDatum(output_datum) = output.datum
        expect SignedMessageChunk(message_position, message_chunk) = output_datum

        and {
          // new state must maintain the previous position
          message_position == pubkey_chunk_position,
          // message chunk is of expected size
          4 == bytearray.length(message_chunk),
          // output value must have the expected token
          1 == assets.quantity_of(output.value, policy_id, expected_asset_name),
          // WIP: verify the signature chunk (lamport)
          verify_lamport(0, 1, message_chunk, pubkey_chunk, signature_chunk),
        }
      }
      VerifyFullSignature ->
        // verify the full signature... all 8 tokens are present
        // concatinate all the chunks from the message hash and verify it equals the expected value
        True
    }
  }

  // mint(redeemer: MintRedeemer, policy_id: PolicyId, self: Transaction) {
  mint(action: MintAction, policy_id: PolicyId, self: Transaction) {
    let Transaction { inputs, mint, outputs, .. } = self

    let mint_dict = mint |> assets.tokens(policy_id)
    let mint_list = mint_dict |> dict.to_pairs()

    when action is {
      Mint -> {
        // mint 8 tokens and send to this validator on a single output
        // output datum must hold merkle root
        // amount minted of each token must be 1
        expect Some(output) = find_output_with_tokens(policy_id, outputs)
        expect InlineDatum(datum) = output.datum
        expect Initial(tokens_not_initalized, public_key_merkle_root) = datum

        expect Script(locked_script) = output.address.payment_credential
        and {
          True,
          True,
          // none have been initialized yet
          tokens_not_initalized == 8,
          // merkle root length must be 32 bytes
          bytearray.length(public_key_merkle_root) == 32,
          // mint 8 tokens
          list.length(mint_list) == 8,
          // must lock in same script as mint
          policy_id == locked_script,
          // minted tokens must have expected names and amounts
          has_expected_names_and_amounts(mint_dict),
        }
      }
      Burn ->
        // all 8 tokens must be present
        // none of the tokens can have a public key chunk attached to them still
        and {
          list.length(mint_list) == 8,
          True,
        }
    }
  }

  else(_) {
    fail
  }
}
