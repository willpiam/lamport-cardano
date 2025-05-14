use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction, Input}
use aiken/builtin

pub fn custom_transaction_id(tx: Transaction) -> ByteArray {
  builtin.serialise_data(tx)

  // for each field in the transaction type
  //   remove the parts we cannot include in the hash
  //   convert to bytes

  // concatinate all the bytes from all the fields
  // return the hash of those bytes
}


test basic_sanity_check() {
  let placeholder = transaction.placeholder
  let tx_id = custom_transaction_id(placeholder)
  tx_id != #[0]
}
