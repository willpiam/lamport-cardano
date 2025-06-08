// use aiken/collection/dict
// use aiken/collection/list
// use cardano/assets.{PolicyId}
// use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction, Input}
// use cardano/address.{Script}
// use aiken/primitive/bytearray
// use aiken/primitive/int
// // use aiken/crypto.{sha2_256}
// use verify_lamport.{LamportPublicKey, verify_lamport}
// use merkle.{verify_merkle_proof}
// use helpers.{SpendAction, MintAction, State, 
// compare_signed_message_chunk, find_output_with_asset, hash_chunk, check_remaining_uninitialized}
// // use custom_transaction_id.{custom_transaction_id}

// /// Verify a full lamport signature of a custom transaction id


// validator lamport_transaction(_version: Int) {
//   spend(
//     datum: Option<State>,
//     action: SpendAction,
//     target_input_reference: OutputReference,
//     self: Transaction,
//   ) {
//     let Transaction { inputs, outputs, .. } = self
//     expect Some(state) = datum

//     when action is {
//       SpendAction.InitializePublicKeyChunk (merkle_proof, position, leaf_hash) -> {
//         // send 1 token back to this validator on an output with a public key chunk which fits in the merkle tree
//         // send the rest of the tokens to the same validator but on a single output

//         // find the policy id
//         expect Some(uninitialized_tokens_input) = inputs |> list.find(fn(input) { input.output_reference == target_input_reference })
//         expect Script(locked_script) = uninitialized_tokens_input.output.address.payment_credential
//         let policy_id = locked_script

//         expect State.Initial(tokens_not_initalized, public_key_merkle_root) = state 
     
//         // find the output with the initialized token
//         let expected_asset_name = bytearray.from_string(int.to_string(position + 1))
//         expect Some(initialized_output) = find_output_with_asset(policy_id, expected_asset_name, outputs)
//         expect InlineDatum(initialized_datum) = initialized_output.datum
//         expect State.PreparedPublicKeyChunk (chunk_position, chunk) = initialized_datum

//         let chunk_elements = list.concat(chunk.pk_left, chunk.pk_right)

//         and {
//           // leaf_hash must be the hash of the chunk
//           leaf_hash == hash_chunk(chunk),
//           // validate merkle proof
//           verify_merkle_proof(public_key_merkle_root, merkle_proof, leaf_hash),
//           // the initialized output must be on the same address (this validator)
//           initialized_output.address == uninitialized_tokens_input.output.address,
//           // chunk is the expected shape
//           32 == list.length(chunk.pk_left),
//           32 == list.length(chunk.pk_right),
//           // all chunk elements must be unique
//           list.length(list.unique(chunk_elements)) == list.length(chunk_elements),
//           // position is correctly specified
//           tokens_not_initalized == 8 - position, 
//           // chunk position must be accurate
//           chunk_position == position,
//           // if we should have a new uninitialized output -> check for it
//           when position is {
//             7 -> True // we are initalizing the last tokens so we don't need a place to store the uninitialized tokens
//             _ -> check_remaining_uninitialized(outputs, policy_id, expected_asset_name, uninitialized_tokens_input, public_key_merkle_root, tokens_not_initalized)
//           }
//         }
//       }
//       SpendAction.VerifySignatureChunk(signature_chunk) -> {
//         // verify a chunk of a signature against a chunk of the message hash and a chunk of the public key
//         expect State.PreparedPublicKeyChunk (pubkey_chunk_position, pubkey_chunk) = state

//         expect Some(public_key_chunk_input) = inputs |> list.find(fn(input) { input.output_reference == target_input_reference })
//         let expected_asset_name = bytearray.from_string(int.to_string(pubkey_chunk_position + 1))
//         expect Script(policy_id) = public_key_chunk_input.output.address.payment_credential

//         expect Some(output) = find_output_with_asset(policy_id, expected_asset_name, outputs)
//         expect InlineDatum(output_datum) = output.datum
//         expect State.SignedMessageChunk(message_position, message_chunk) = output_datum

//         and {
//           // signature chunk utxo must remain on the address of this validator
//           output.address == public_key_chunk_input.output.address,
//           // public key chunk should be of expected size
//           32 == list.length(pubkey_chunk.pk_left),
//           32 == list.length(pubkey_chunk.pk_right),
//           // signature chunk should be of expected size
//           32 == list.length(signature_chunk),
//           // new state must maintain the previous position
//           message_position == pubkey_chunk_position,
//           message_position < 8,
//           message_position >= 0,
//           // message chunk is of expected size
//           4 == bytearray.length(message_chunk),
//           // output value must have the expected token
//           1 == assets.quantity_of(output.value, policy_id, expected_asset_name),
//           // verify the signature chunk (lamport)
//           verify_lamport(0, 32, message_chunk, pubkey_chunk, signature_chunk),
//         }
//       }
//       SpendAction.VerifyFullSignature(_) -> {
//         // verify the full signature... all 8 tokens are present
//         // concatinate all the chunks from the message hash and verify it equals the expected value

//         // the target input holds one of the 8 expected tokens but we don't know which one
//         // this is because this validator will be run once for each of the 8 inputs. From 
//         // the address of this input we can determine the policy id of the 8 tokens
//         expect Some(one_of_expected_inputs) = inputs |> list.find(fn(input) { input.output_reference == target_input_reference })
//         expect Script(policy_id) = one_of_expected_inputs.output.address.payment_credential
      
//         let signed_message_hash = ["1", "2", "3", "4", "5", "6", "7", "8"]
//           |> list.map(fn(asset_name) {
//             expect Some(output) = find_output_with_asset(policy_id, asset_name, list.map(inputs, fn(input) { input.output }))
//             expect InlineDatum(output_datum) = output.datum
//             expect State.SignedMessageChunk(message_position, message_chunk) = output_datum
//             State.SignedMessageChunk(message_position, message_chunk)
//           }) 
//           |> list.sort(compare_signed_message_chunk)
//           |> list.map(fn(chunk)  { // todo: put this logic into the reduce step so we can do one less pass
//             expect State.SignedMessageChunk(_, part) = chunk
//             part
//           })
//           |> list.reduce(#[], bytearray.concat)

//         and {
//           // signed message hash must match the expected message hash
//         //   signed_message_hash == custom_transaction_id(self),
//           // there must be at least 8 inputs (one for each token + whatever else the user is doing)
//           list.length(inputs) >= 8,
//           // must burn the tokens
//           list.all(outputs, fn(output) { // no outputs contain tokens with the policy id
//             output.value 
//               |> assets.tokens(policy_id) 
//               |> dict.is_empty()
//           }),
//         }
//       }
//     }
//   }

//   mint(action: MintAction, policy_id: PolicyId, self: Transaction) {
//     let Transaction { mint, outputs, .. } = self

//     let mint_dict = mint |> assets.tokens(policy_id)
//     let mint_list = mint_dict |> dict.to_pairs()

//     when action is {
//       MintAction.Mint -> {
//         // mint 8 tokens and send to this validator on a single output
//         // output datum must hold merkle root
//         // amount minted of each token must be 1
//         expect Some(output) = outputs |> list.find(fn(output) {
//           8 == (output.value
//             |> assets.tokens(policy_id)
//             |> dict.to_pairs()
//             |> list.length())
//         })
//         expect InlineDatum(datum) = output.datum
//         expect State.Initial(tokens_not_initalized, public_key_merkle_root) = datum

//         expect Script(locked_script) = output.address.payment_credential
//         and {
//           // none have been initialized yet
//           tokens_not_initalized == 8,
//           // merkle root length must be 32 bytes
//           bytearray.length(public_key_merkle_root) == 32,
//           // mint 8 tokens
//           list.length(mint_list) == 8,
//           // must lock in same script as mint
//           policy_id == locked_script,
//           // minted tokens must have expected names and amounts
//           dict.get(mint_dict, "1") == Some(1),
//           dict.get(mint_dict, "2") == Some(1),
//           dict.get(mint_dict, "3") == Some(1),
//           dict.get(mint_dict, "4") == Some(1),
//           dict.get(mint_dict, "5") == Some(1),
//           dict.get(mint_dict, "6") == Some(1),
//           dict.get(mint_dict, "7") == Some(1),
//           dict.get(mint_dict, "8") == Some(1),
//         }
//       }
//       MintAction.Burn -> and {
//         // all 8 tokens must be present
//         list.length(mint_list) == 8,
//         // mint must be entierly negative
//         mint_list |> list.all(fn(token) {
//           let Pair(_, amount) = token
//           amount == -1 
//         }),
//       }
//     }
//   }

//   else(_) {
//     fail
//   }
// }
