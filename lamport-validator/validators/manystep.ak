use aiken/collection/dict.{Dict}
use aiken/collection/list
use cardano/assets.{PolicyId, AssetName}
use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction}
use cardano/address.{Script}
use aiken/primitive/bytearray

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
  InitializePublicKeyChunk
  VerifySignatureChunk
  VerifyFullSignature
}

pub type SpendRedeemer {
  action: SpendAction,
}

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

validator manysteplamport(_version: Int) {
  spend(
    datum: Option<Data>,
    redeemer: SpendRedeemer,
    _utxo: OutputReference,
    _self: Transaction,
  ) {
    when redeemer.action is {
      InitializePublicKeyChunk ->
        // send 1 token back to this validator on an output with a public key chunk which fits in the merkle tree
        // send the rest of the tokens to the same validator but on a single output
        True
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
