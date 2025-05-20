use aiken/collection/dict.{Dict}
use aiken/collection/list
use cardano/assets.{PolicyId, AssetName}
use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction, Input}
use cardano/address.{Script}
use aiken/primitive/bytearray
use aiken/primitive/int
use aiken/crypto.{sha2_256}
use verify_lamport.{LamportPublicKey, verify_lamport}
use merkle.{ProofNode, verify_merkle_proof}
use helpers.{SpendAction, MintAction, PublicKeyChunk, State, 
compare_signed_message_chunk, find_output_with_asset, hash_chunk, check_remaining_uninitialized}


pub fn handle_mint(outputs : List<Output>, policy_id : PolicyId, mint_dict : Dict<AssetName, Int>) -> Bool {
  // mint 8 tokens and send to this validator on a single output
  // output datum must hold merkle root
  // amount minted of each token must be 1
  expect Some(output) = outputs |> list.find(fn(output) {
    8 == (output.value
      |> assets.tokens(policy_id)
      |> dict.to_pairs()
      |> list.length())
  })
  expect InlineDatum(datum) = output.datum
  expect State.Initial(tokens_not_initalized, public_key_merkle_root) = datum

  expect Script(locked_script) = output.address.payment_credential
  and {
    // none have been initialized yet
    tokens_not_initalized == 8,
    // merkle root length must be 32 bytes
    bytearray.length(public_key_merkle_root) == 32,
    // mint 8 tokens
    // list.length(mint_list) == 8,
    dict.size(mint_dict) == 8,
    // must lock in same script as mint
    policy_id == locked_script,
    // minted tokens must have expected names and amounts
    dict.get(mint_dict, "1") == Some(1),
    dict.get(mint_dict, "2") == Some(1),
    dict.get(mint_dict, "3") == Some(1),
    dict.get(mint_dict, "4") == Some(1),
    dict.get(mint_dict, "5") == Some(1),
    dict.get(mint_dict, "6") == Some(1),
    dict.get(mint_dict, "7") == Some(1),
    dict.get(mint_dict, "8") == Some(1),
  }
}

/// ensure the burn is handled correctly
pub fn handle_burn(mint_list : List<Pair<AssetName, Int>>) -> Bool {
  and {
    // all 8 tokens must be present
    list.length(mint_list) == 8,
    // mint must be entierly negative
    mint_list |> list.all(fn(token) {
      let Pair(_, amount) = token
      amount == -1 
    }),
  }
}
