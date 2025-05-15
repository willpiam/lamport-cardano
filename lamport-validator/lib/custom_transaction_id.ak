use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction, Input}
use aiken/builtin
use aiken/crypto.{Hash, Sha2_256}

// TODO: come up with a better name than Custom Transaction Id

type CustomTransactionIdBuilder {
  inputs: Option<ByteArray>
  reference_inputs: Option<ByteArray>
}

type CustomTransactionId = Hash<Sha2_256, ByteArray>

fn new_custom_transaction_id(tx: Transaction) -> CustomTransactionIdBuilder {
  CustomTransactionIdBuilder { 
    inputs: None, 
    reference_inputs: None 
  }
}

fn with_inputs(tx: CustomTransactionIdBuilder, inputs: List<Input>) -> CustomTransactionIdBuilder {
  let inputs_bytes = builtin.serialise_data(inputs)

}

fn build_custom_transaction_id(tx: CustomTransactionIdBuilder) -> ByteArray {
 #[1,0]
}



pub fn custom_transaction_id(tx: Transaction) -> ByteArray {
  builtin.serialise_data(tx)

  // for each field in the transaction type
  //   remove the parts which we cannot include in the hash
  //   convert to bytes

  // concatinate all the bytes from all the fields
  // return the hash of those bytes
}


test basic_sanity_check() {
  let placeholder = transaction.placeholder
  let tx_id = custom_transaction_id(placeholder)
  tx_id != #[0]
}
