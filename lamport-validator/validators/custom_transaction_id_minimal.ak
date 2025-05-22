use custom_transaction_id.{custom_transaction_id}
use helpers.{SpendAction} 
use cardano/transaction.{Transaction, OutputReference}

validator custom_transaction_id_minimal {
  spend(
    datum: Option<Data>,
    action: SpendAction,
    target_input_reference: OutputReference,
    self: Transaction,
  ) {
    expect SpendAction.VerifyFullSignature(message) = action
    // let id = custom_transaction_id(self)
    // trace @"--have id--"
    // id == message
    message == sha2_256(#[1])
  }
}
