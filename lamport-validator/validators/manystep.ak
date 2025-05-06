use aiken/collection/dict.{Dict}
use aiken/collection/list
use cardano/assets.{PolicyId, AssetName}
use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction, Input}
use cardano/address.{Script}
use aiken/primitive/bytearray
use aiken/primitive/int
use aiken/builtin

/// Verify a full lamport signature by breaking it into multiple pieces
/// this demo/experiment is a work in progress and not yet finished
pub type MintAction {
  Mint
  Burn
}

// pub type MintRedeemer {
//   action: MintAction,
//   root: ByteArray,
// }

pub type SpendAction {
  InitializePublicKeyChunk {merkle_proof: ByteArray, position: Int}
  VerifySignatureChunk
  VerifyFullSignature
}

// pub type SpendRedeemer {
//   action: SpendAction,
// }

pub type State {
  Initial {tokens_not_initalized: Int, public_key_merkle_root: ByteArray}
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
      InitializePublicKeyChunk { merkle_proof, position } -> {
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

        and {
          // TODO: make sure initialized_output contains a public key chunk in the datum
          // TODO: validate merkle proof

          // position is correctly specified
          tokens_not_initalized == 8 - position, 
          or {
            // if looking at the last token we will not create a new "uninitialized" output
            expected_asset_name == eight,
            // otherwise we need to ensure the new uninitialized output is properly formed
            check_remaining_uninitialized(outputs, policy_id, expected_asset_name, uninitialized_tokens_input, public_key_merkle_root, tokens_not_initalized),
          }
        }
      }
      VerifySignatureChunk ->
        // verify a chunk of a signature against a chunk of the message hash and a chunk of the public key
        True
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
