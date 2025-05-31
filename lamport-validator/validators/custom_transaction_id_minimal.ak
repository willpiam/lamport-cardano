use custom_transaction_id.{custom_transaction_id}
use helpers.{SpendAction} 
use aiken/builtin
use aiken/crypto.{sha2_256}
use cardano/transaction.{Transaction, OutputReference}
use cardano/assets

validator custom_transaction_id_minimal {
  spend(
    datum: Option<Data>,
    action: SpendAction,
    target_input_reference: OutputReference,
    self: Transaction,
  ) {
    expect SpendAction.VerifyFullSignature(message) = action
    let mint_bytes = builtin.serialise_data(self.mint)
    let checksum = sha2_256(mint_bytes)
    // custom_transaction_id(self) == message
    // True
    checksum == message
  }
}

test custom_transaction_id_minimal_test() {
  let placeholder_utxo = OutputReference {
    transaction_id: "",
    output_index: 0,
  }

  let my_tx = Transaction {
    ..transaction.placeholder,
    mint: assets.from_asset(#[212, 65, 34, 117, 83, 160, 241, 169, 101, 254, 231, 214, 10, 15, 114, 75, 54, 141, 209, 189, 219, 194, 8, 115, 15, 204, 235, 207],
  #[77, 121,  84, 111, 107, 101,110], 1 )
  }

  let mint_bytes = builtin.serialise_data(my_tx.mint)
  trace @"mint_bytes": mint_bytes
  let message = sha2_256(mint_bytes)
  trace @"message": message

  custom_transaction_id_minimal.spend(
    None, 
    SpendAction.VerifyFullSignature(message),
    placeholder_utxo,
    my_tx
  )
}