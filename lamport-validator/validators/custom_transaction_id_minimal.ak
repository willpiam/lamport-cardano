use custom_transaction_id.{custom_transaction_id}
use helpers.{SpendAction} 
use cardano/transaction.{Transaction, OutputReference}

validator custom_transaction_id_minimal {
  spend(
    _datum: Option<Data>,
    action: SpendAction,
    _target_input_reference: OutputReference,
    self: Transaction,
  ) {
    expect SpendAction.VerifyFullSignature(message) = action
    custom_transaction_id(self) == message
  }
}