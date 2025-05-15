use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction, Input}
use aiken/builtin
use aiken/crypto.{Hash, Sha2_256, sha2_256}
use cardano/assets.{Lovelace, Value}

// TODO: come up with a better name than Custom Transaction Id

type CustomTransactionIdBuilder {
  inputs: Option<ByteArray>,
  reference_inputs: Option<ByteArray>,
  outputs: Option<ByteArray>,
  fee: Option<ByteArray>,
  mint: Option<ByteArray>,
  certificates: Option<ByteArray>,
  withdrawals: Option<ByteArray>,
  extra_signatories: Option<ByteArray>,
  redeemers: Option<ByteArray>,
  datums: Option<ByteArray>,
  votes: Option<ByteArray>,
  proposal_procedures: Option<ByteArray>,
  current_treasury_amount: Option<ByteArray>,
  treasury_donation: Option<ByteArray>,
}

type CustomTransactionId = Hash<Sha2_256, ByteArray>

fn new_custom_transaction_id(tx: Transaction) -> CustomTransactionIdBuilder {
  CustomTransactionIdBuilder { 
    inputs: None, 
    reference_inputs: None,
    outputs: None,
    fee: None,
    mint: None,
    certificates: None,
    withdrawals: None,
    extra_signatories: None,
    redeemers: None,
    datums: None,
    votes: None,
    proposal_procedures: None,
    current_treasury_amount: None,
    treasury_donation: None,
  }
}

fn with_inputs(self: CustomTransactionIdBuilder, inputs: List<Input>) -> CustomTransactionIdBuilder {
  let inputs_bytes = builtin.serialise_data(inputs)

  CustomTransactionIdBuilder {
    ..self,
    inputs: Some(inputs_bytes),
  }
}

fn with_reference_inputs(self: CustomTransactionIdBuilder, reference_inputs: List<Input>) -> CustomTransactionIdBuilder {
  let reference_inputs_bytes = builtin.serialise_data(reference_inputs)

  CustomTransactionIdBuilder {
    ..self,
    reference_inputs: Some(reference_inputs_bytes),
  }
}

fn with_outputs(self: CustomTransactionIdBuilder, outputs: List<Output>) -> CustomTransactionIdBuilder {
  let outputs_bytes = builtin.serialise_data(outputs)

  CustomTransactionIdBuilder {
    ..self,
    outputs: Some(outputs_bytes),
  }
}

fn with_fee(self: CustomTransactionIdBuilder, fee: Lovelace) -> CustomTransactionIdBuilder {
  let fee_bytes = builtin.serialise_data(fee)

  CustomTransactionIdBuilder {
    ..self,
    fee: Some(fee_bytes),
  }
}

fn with_mint(self: CustomTransactionIdBuilder, mint: Value) -> CustomTransactionIdBuilder {
  let mint_bytes = builtin.serialise_data(mint)

  CustomTransactionIdBuilder {
    ..self,
    mint: Some(mint_bytes),
  }
}



fn build_custom_transaction_id(tx: CustomTransactionIdBuilder) -> CustomTransactionId {
  sha2_256(builtin.serialise_data(tx))
}

pub fn custom_transaction_id(tx: Transaction) -> ByteArray {

  let builder = new_custom_transaction_id(tx)
                  |> with_inputs(tx.inputs)
                  |> with_reference_inputs(tx.reference_inputs)
                  |> with_outputs(tx.outputs)
                  |> with_fee(tx.fee)
                  |> with_mint(tx.mint)

  build_custom_transaction_id(builder)
  // builtin.serialise_data(tx)

  // for each field in the transaction type
  //   remove the parts which we cannot include in the hash
  //   convert to bytes

  // concatinate all the bytes from all the fields
  // return the hash of those bytes


}


test basic_sanity_check() {
  let placeholder = transaction.placeholder
  let tx_id = custom_transaction_id(placeholder)
  tx_id != transaction.placeholder.id
}
