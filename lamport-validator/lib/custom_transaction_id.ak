use cardano/transaction.{ValidityRange, Transaction, Input, OutputReference, Output }
use aiken/builtin
use aiken/crypto.{Hash, Sha2_256, sha2_256, VerificationKeyHash}
use cardano/assets.{Value, Lovelace}
use cardano/governance.{Voter, GovernanceActionId, Vote}
use cardano/certificate.{Certificate}
use cardano/address.{Credential}
// use aiken/collection/dict.{Dict}
use aiken/collection/list
use aiken/primitive/bytearray
// use helpers.{SpendAction}


// TODO: come up with a better name than Custom Transaction Id
// TODO: for each "with_" function make sure to avoid everything that would cause the circular-hash-input problem

// Transaction as defined in aiken docs
// Transaction {
//   inputs: List<Input>,
//   reference_inputs: List<Input>,
//   outputs: List<Output>,
//   fee: Lovelace,
//   mint: Value,
//   certificates: List<Certificate>,
//   withdrawals: Pairs<Credential, Lovelace>,
//   validity_range: ValidityRange,
//   extra_signatories: List<VerificationKeyHash>,
//   redeemers: Pairs<ScriptPurpose, Redeemer>,
//   datums: Dict<DataHash, Data>,
//   id: TransactionId,
//   votes: Pairs<Voter, Pairs<GovernanceActionId, Vote>>,
//   proposal_procedures: List<ProposalProcedure>,
//   current_treasury_amount: Option<Lovelace>,
//   treasury_donation: Option<Lovelace>,
// }

// DONE
// mint, donation, treasury amount, reference inputs, extra signatories, withdrawals
// TODO:
// certificates
// votes
// proposal procedures
// HARD (WHY)
// fee     (must calculate exact fee before hand )
// inputs  (in lamport case cannot know exactly before signing))
// outputs (cannot know exactly before signing simply because the output object will contain this transactions real hash/id)


type CustomTransactionIdBuilder {
  inputs: Option<ByteArray>,
  reference_inputs: Option<ByteArray>,
  outputs: Option<ByteArray>,
  fee: Option<ByteArray>,
  mint: Option<ByteArray>,
  certificates: Option<ByteArray>,
  withdrawals: Option<ByteArray>,
  validity_range: Option<ByteArray>,
  extra_signatories: Option<ByteArray>,
  redeemers: Option<ByteArray>,
  datums: Option<ByteArray>,
  votes: Option<ByteArray>,
  proposal_procedures: Option<ByteArray>,
  current_treasury_amount: Option<ByteArray>,
  treasury_donation: Option<ByteArray>,
}

type CustomTransactionId = Hash<Sha2_256, ByteArray>

fn new_custom_transaction_id() -> CustomTransactionIdBuilder {
  CustomTransactionIdBuilder { 
    inputs: None, 
    reference_inputs: None,
    outputs: None,
    fee: None,
    mint: None,
    certificates: None,
    withdrawals: None,
    validity_range: None,
    extra_signatories: None,
    redeemers: None,
    datums: None,
    votes: None,
    proposal_procedures: None,
    current_treasury_amount: None,
    treasury_donation: None,
  }
}


fn encode_reference_inputs_concat(inputs: List<Input>) -> ByteArray {
  // Build a deterministic byte blob: tx_id bytes || serialised(index) for each reference input, in order
  inputs
    |> list.map(fn (input: Input) -> OutputReference { input.output_reference })
    |> list.reduce(#[], fn (acc: ByteArray, output_ref: OutputReference) -> ByteArray {
      let tx_id_bytes = output_ref.transaction_id
      let index_bytes = builtin.serialise_data(output_ref.output_index)
      bytearray.concat(acc, bytearray.concat(tx_id_bytes, index_bytes))
    })
}

fn with_inputs(self: CustomTransactionIdBuilder, inputs: List<Input>) -> CustomTransactionIdBuilder {
  let inputs_bytes = encode_reference_inputs_concat(inputs)
  CustomTransactionIdBuilder {
    ..self,
    inputs: Some(inputs_bytes),
  }
}

fn with_reference_inputs(self: CustomTransactionIdBuilder, reference_inputs: List<Input>) -> CustomTransactionIdBuilder {
  let reference_inputs_bytes = encode_reference_inputs_concat(reference_inputs)

  CustomTransactionIdBuilder {
    ..self,
    reference_inputs: Some(reference_inputs_bytes),
  }
}

fn with_mint(self: CustomTransactionIdBuilder, mint: Value) -> CustomTransactionIdBuilder {
  CustomTransactionIdBuilder {
    ..self,
    mint: Some(builtin.serialise_data(mint)),
  }
}

fn with_validity_range(self: CustomTransactionIdBuilder, validity_range: ValidityRange) -> CustomTransactionIdBuilder {
  trace @"inside with_validity_range": validity_range
  let validity_range_bytes = builtin.serialise_data(validity_range)
  trace @"validity_range_bytes is ": validity_range_bytes

  CustomTransactionIdBuilder {
    ..self,
    validity_range: Some(validity_range_bytes)
  }
}

fn with_votes(self: CustomTransactionIdBuilder, votes: Pairs<Voter, Pairs<GovernanceActionId, Vote>>) -> CustomTransactionIdBuilder {
  let votes_bytes = builtin.serialise_data(votes)

  CustomTransactionIdBuilder {
    ..self,
    votes: Some(votes_bytes)
  }
}

// fn with_proposal_procedures(self: CustomTransactionIdBuilder, proposal_procedures: List<ProposalProcedure>) -> CustomTransactionIdBuilder {
//   let proposal_procedures_bytes = builtin.serialise_data(proposal_procedures)

//   CustomTransactionIdBuilder {
//     ..self,
//     proposal_procedures: Some(proposal_procedures_bytes)
//   }
// }

// fn with_current_treasury_amount(self: CustomTransactionIdBuilder, current_treasury_amount: Option<Lovelace>) -> CustomTransactionIdBuilder {
//   let current_treasury_amount_bytes = builtin.serialise_data(current_treasury_amount)

//   CustomTransactionIdBuilder {
//     ..self,
//     current_treasury_amount: Some(current_treasury_amount_bytes)
//   }
// }

fn with_treasury_donation(self: CustomTransactionIdBuilder, treasury_donation: Option<Lovelace>) -> CustomTransactionIdBuilder {
  CustomTransactionIdBuilder {
    ..self,
    treasury_donation: Some(builtin.serialise_data(treasury_donation))
  }
}

fn with_current_treasury_amount(self: CustomTransactionIdBuilder, current_treasury_amount: Option<Lovelace>) -> CustomTransactionIdBuilder {
  CustomTransactionIdBuilder {
    ..self,
    current_treasury_amount: Some(builtin.serialise_data(current_treasury_amount))
  }
}

fn with_extra_signatories(self: CustomTransactionIdBuilder, extra_signatories: List<VerificationKeyHash>) -> CustomTransactionIdBuilder {
  CustomTransactionIdBuilder {
    ..self,
    extra_signatories: Some(builtin.serialise_data(extra_signatories))
  }
}

fn with_certificates(self: CustomTransactionIdBuilder, certificates: List<Certificate>) -> CustomTransactionIdBuilder {
  CustomTransactionIdBuilder {
    ..self,
    certificates: Some(builtin.serialise_data(certificates))
  }
}

fn process_output(output: Output) -> ByteArray {
  let address = builtin.serialise_data(output.address)
  let value = builtin.serialise_data(output.value)
  trace @"value: ": value
  // ignore datum and reference_script for now
  address
    |> bytearray.concat(value)
    // |> bytearray.concat(datum)
    // |> bytearray.concat(reference_script)
}

fn with_outputs(self: CustomTransactionIdBuilder, outputs: List<Output>) -> CustomTransactionIdBuilder {
  // let outputs_bytes = builtin.serialise_data(outputs)
  trace @"number of outputs": list.length(outputs)
  let outputs_bytes = outputs
    |> list.reduce(#[], fn (acc, output) -> ByteArray {
      // let bytes = builtin.serialise_data(output)
      trace @"lovelace on output": assets.lovelace_of(output.value)
      let bytes = process_output(output)
      bytearray.concat(acc, bytes)
    })

  // trace @"encoded outputs: ": outputs_bytes
  CustomTransactionIdBuilder {
    ..self,
    // outputs: Some(builtin.serialise_data(outputs))
    outputs: Some(outputs_bytes)
  }
}

fn attach(a: ByteArray, b: Option<ByteArray>) -> ByteArray {
  when b is {
    Some(element) -> bytearray.concat(a, element)
    None -> a
  }
}

fn with_withdrawals(self: CustomTransactionIdBuilder, withdrawals: Pairs<Credential, Lovelace>) -> CustomTransactionIdBuilder {
  let bytes = withdrawals 
    |> list.map(fn (pair: Pair<Credential, Lovelace>) -> ByteArray {
      let Pair(credential, lovelace) = pair
      let credential_bytes = builtin.serialise_data(credential)
      let lovelace_bytes = builtin.serialise_data(lovelace)
      bytearray.concat(credential_bytes, lovelace_bytes)
    }) 
    |> list.reduce(#[], fn (acc, element) -> ByteArray {
      bytearray.concat(acc, element)
    })
  CustomTransactionIdBuilder {
    ..self,
    withdrawals: Some(bytes)
  }
}

fn build_custom_transaction_id(builder: CustomTransactionIdBuilder) -> CustomTransactionId {
  expect Some(mint) = builder.mint
  // Minimal MVP: hash only the mint field for now to validate end-to-end plumbing
  let blob = mint
    // |> attach(builder.votes)
    // |> attach(builder.certificates)
    // |> attach(builder.validity_range)
  //   // |> attach(builder.fee)
  //   // |> attach(builder.redeemers)
  //   // |> attach(builder.datums)
  //   // |> attach(builder.proposal_procedures)
  sha2_256(blob)
}

pub fn custom_transaction_id(tx: Transaction) -> ByteArray {
  let builder = new_custom_transaction_id()
                  |> with_mint(tx.mint)
                  |> with_treasury_donation(tx.treasury_donation)
                  |> with_current_treasury_amount(tx.current_treasury_amount)
                  |> with_reference_inputs(tx.reference_inputs)
                  |> with_extra_signatories(tx.extra_signatories)
                  |> with_withdrawals(tx.withdrawals)
                  // inputs excluded from the hash
                  // outputs excluded from the hash
                  // |> with_outputs(tx.outputs)
                  // |> with_votes(tx.votes)
                  // |> with_certificates(tx.certificates)
                     // |> with_validity_range(tx.validity_range)
  //                 // |> with_certificates(tx.certificates)
  //                 // |> with_proposal_procedures(tx.proposal_procedures)
  //                 // |> with_fee(tx.fee)
  //                 // |> with_datums(tx.datums)
  //                 // |> with_redeemers(tx.redeemers)
  build_custom_transaction_id(builder)
}

test basic_sanity_check() {
  let placeholder = transaction.placeholder
  let tx_id = custom_transaction_id(placeholder)
  tx_id != transaction.placeholder.id
}
