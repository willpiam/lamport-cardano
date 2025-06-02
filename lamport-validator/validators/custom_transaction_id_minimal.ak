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
    trace @"mint_bytes": mint_bytes
    let checksum = sha2_256(mint_bytes)
    trace @"checksum": checksum
    trace @"message": message
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

// preimage (off-chain name) or mint_bytes (on-chain name)
// on-chain  A1581CD441227553A0F1A965FEE7D60A0F724B368DD1BDDBC208730FCCEBCFA1474D79546F6B656E01
// off-chain bf581cd441227553a0f1a965fee7d60a0f724b368dd1bddbc208730fccebcfbf474d79546f6b656e01ffff